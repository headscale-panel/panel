package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/utils/serializer"
	"os"
	"path/filepath"
	"strings"
)

type panelSettingsService struct{}

var PanelSettingsService = new(panelSettingsService)

// PanelConnectionSettings represents the panel's Headscale connection config.
// API key is never returned in plain text after initial setup.
type PanelConnectionSettings struct {
	GRPCAddr    string `json:"grpc_addr"`
	Insecure    bool   `json:"insecure"`
	HasAPIKey   bool   `json:"has_api_key"`
	IsConnected bool   `json:"is_connected"`
}

// GetConnectionSettings returns current panel connection settings (API key masked).
func (s *panelSettingsService) GetConnectionSettings(actorUserID uint) (*PanelConnectionSettings, error) {
	if err := RequireAdmin(actorUserID); err != nil {
		return nil, err
	}

	hasKey := strings.TrimSpace(conf.Conf.Headscale.APIKey) != ""
	connected := headscale.GlobalClient != nil && headscale.GlobalClient.Conn != nil

	return &PanelConnectionSettings{
		GRPCAddr:    conf.Conf.Headscale.GRPCAddr,
		Insecure:    conf.Conf.Headscale.Insecure,
		HasAPIKey:   hasKey,
		IsConnected: connected,
	}, nil
}

// SaveConnectionSettings persists gRPC connection settings and reinitializes the client.
// apiKey is optional - if empty, the existing key is preserved.
func (s *panelSettingsService) SaveConnectionSettings(actorUserID uint, grpcAddr, apiKey string, insecure bool) error {
	if err := RequireAdmin(actorUserID); err != nil {
		return err
	}

	grpcAddr = strings.TrimSpace(grpcAddr)
	if grpcAddr == "" {
		return serializer.NewError(serializer.CodeParamErr, "gRPC 地址不能为空", nil)
	}

	// If no new API key provided, keep existing one
	effectiveAPIKey := strings.TrimSpace(apiKey)
	if effectiveAPIKey == "" {
		effectiveAPIKey = conf.Conf.Headscale.APIKey
	}
	if effectiveAPIKey == "" {
		return serializer.NewError(serializer.CodeParamErr, "API Key 不能为空", nil)
	}

	// Backup old config
	old := conf.Conf.Headscale

	// Apply new config
	conf.Conf.Headscale.GRPCAddr = grpcAddr
	conf.Conf.Headscale.APIKey = effectiveAPIKey
	conf.Conf.Headscale.Insecure = insecure

	// Persist to DB
	if err := PersistHeadscaleConnection(grpcAddr, effectiveAPIKey, insecure); err != nil {
		conf.Conf.Headscale = old
		return serializer.NewError(serializer.CodeDBError, "保存连接设置到数据库失败", err)
	}

	// Also persist to .env (best effort)
	_ = writePanelConnectionEnv(grpcAddr, effectiveAPIKey, insecure)

	// Reinitialize headscale client
	headscale.Close()
	if err := headscale.Init(); err != nil {
		// Rollback
		conf.Conf.Headscale = old
		_ = writePanelConnectionEnv(old.GRPCAddr, old.APIKey, old.Insecure)
		_ = headscale.Init()
		return serializer.NewError(serializer.CodeThirdPartyServiceError, "重新初始化 Headscale 客户端失败", err)
	}

	return nil
}

// --- Headscale connection settings DB persistence ---

const panelSettingKeyHeadscale = "headscale_connection"

type headscaleConnectionPayload struct {
	GRPCAddr        string `json:"grpc_addr"`
	APIKey          string `json:"api_key,omitempty"`
	APIKeyEncrypted string `json:"api_key_enc,omitempty"`
	Insecure        bool   `json:"insecure"`
}

// PersistHeadscaleConnection saves headscale connection settings to the database.
func PersistHeadscaleConnection(grpcAddr, apiKey string, insecure bool) error {
	encryptedAPIKey, err := encryptPanelSecret(apiKey)
	if err != nil {
		return err
	}

	payload := headscaleConnectionPayload{
		GRPCAddr:        grpcAddr,
		APIKeyEncrypted: encryptedAPIKey,
		Insecure:        insecure,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	var setting model.PanelSetting
	result := model.DB.Where("key = ?", panelSettingKeyHeadscale).First(&setting)
	if result.Error != nil {
		// Not found — create
		setting = model.PanelSetting{Key: panelSettingKeyHeadscale, Value: string(data)}
		return model.DB.Create(&setting).Error
	}
	setting.Value = string(data)
	return model.DB.Save(&setting).Error
}

// LoadHeadscaleConnectionFromDB loads saved headscale connection settings from DB
// and applies them to conf.Conf.Headscale. Returns true if settings were found.
func LoadHeadscaleConnectionFromDB() bool {
	var setting model.PanelSetting
	if err := model.DB.Where("key = ?", panelSettingKeyHeadscale).First(&setting).Error; err != nil {
		return false
	}
	var payload headscaleConnectionPayload
	if err := json.Unmarshal([]byte(setting.Value), &payload); err != nil {
		return false
	}
	if strings.TrimSpace(payload.GRPCAddr) == "" {
		return false
	}
	apiKey, err := decryptPanelSecret(payload.APIKeyEncrypted, payload.APIKey)
	if err != nil {
		return false
	}
	conf.Conf.Headscale.GRPCAddr = payload.GRPCAddr
	conf.Conf.Headscale.APIKey = apiKey
	conf.Conf.Headscale.Insecure = payload.Insecure
	return true
}

// SyncDataFromHeadscale syncs resources/groups from Headscale ACL into local DB.
func (s *panelSettingsService) SyncDataFromHeadscale(actorUserID uint) error {
	if err := RequireAdmin(actorUserID); err != nil {
		return err
	}

	return HeadscaleService.SyncACL()
}

func writePanelConnectionEnv(grpcAddr, apiKey string, insecureMode bool) error {
	_ = apiKey
	path := filepath.Clean(".env")

	lines := []string{}
	data, err := os.ReadFile(path)
	if err == nil {
		normalized := strings.ReplaceAll(string(data), "\r\n", "\n")
		lines = strings.Split(normalized, "\n")
	} else if !os.IsNotExist(err) {
		return err
	}

	setLine := func(key, value string) {
		target := key + "="
		for i, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "export ") {
				trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "export "))
			}
			if strings.HasPrefix(trimmed, target) {
				lines[i] = target + value
				return
			}
		}
		lines = append(lines, target+value)
	}
	deleteLine := func(key string) {
		target := key + "="
		filtered := lines[:0]
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "export ") {
				trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "export "))
			}
			if strings.HasPrefix(trimmed, target) {
				continue
			}
			filtered = append(filtered, line)
		}
		lines = filtered
	}

	setLine("HEADSCALE_GRPC_ADDR", grpcAddr)
	deleteLine("HEADSCALE_API_KEY")
	if insecureMode {
		setLine("HEADSCALE_INSECURE", "true")
	} else {
		setLine("HEADSCALE_INSECURE", "false")
	}

	content := strings.Join(lines, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}

	return os.WriteFile(path, []byte(content), 0600)
}

// BuiltinOIDCConfig is the response for the built-in OIDC endpoint.
type BuiltinOIDCConfig struct {
	Issuer       string   `json:"issuer"`
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret,omitempty"`
	Scope        []string `json:"scope"`
	Enabled      bool     `json:"enabled"`
}

// --- OIDC Settings persistence ---

const panelSettingKeyOIDC = "oidc_settings"

// OIDCSettingsPayload is the JSON payload persisted for the OIDC form.
type OIDCSettingsPayload struct {
	Enabled                    bool     `json:"enabled"`
	OnlyStartIfOIDCIsAvailable bool     `json:"only_start_if_oidc_is_available"`
	Issuer                     string   `json:"issuer"`
	ClientID                   string   `json:"client_id"`
	ClientSecret               string   `json:"client_secret"`
	ClientSecretPath           string   `json:"client_secret_path"`
	Scope                      []string `json:"scope"`
	EmailVerifiedRequired      bool     `json:"email_verified_required"`
	AllowedDomains             []string `json:"allowed_domains"`
	AllowedUsers               []string `json:"allowed_users"`
	AllowedGroups              []string `json:"allowed_groups"`
	StripEmailDomain           bool     `json:"strip_email_domain"`
	Expiry                     string   `json:"expiry"`
	UseExpiryFromToken         bool     `json:"use_expiry_from_token"`
	PKCEEnabled                bool     `json:"pkce_enabled"`
	PKCEMethod                 string   `json:"pkce_method"`
}

type persistedOIDCSettingsPayload struct {
	Enabled                    bool     `json:"enabled"`
	OnlyStartIfOIDCIsAvailable bool     `json:"only_start_if_oidc_is_available"`
	Issuer                     string   `json:"issuer"`
	ClientID                   string   `json:"client_id"`
	ClientSecret               string   `json:"client_secret,omitempty"`
	ClientSecretEncrypted      string   `json:"client_secret_enc,omitempty"`
	ClientSecretPath           string   `json:"client_secret_path"`
	Scope                      []string `json:"scope"`
	EmailVerifiedRequired      bool     `json:"email_verified_required"`
	AllowedDomains             []string `json:"allowed_domains"`
	AllowedUsers               []string `json:"allowed_users"`
	AllowedGroups              []string `json:"allowed_groups"`
	StripEmailDomain           bool     `json:"strip_email_domain"`
	Expiry                     string   `json:"expiry"`
	UseExpiryFromToken         bool     `json:"use_expiry_from_token"`
	PKCEEnabled                bool     `json:"pkce_enabled"`
	PKCEMethod                 string   `json:"pkce_method"`
}

// GetOIDCSettings returns the persisted OIDC form settings.
func (s *panelSettingsService) GetOIDCSettings(actorUserID uint) (*OIDCSettingsPayload, error) {
	if err := RequireAdmin(actorUserID); err != nil {
		return nil, err
	}

	var setting model.PanelSetting
	if err := model.DB.Where("key = ?", panelSettingKeyOIDC).First(&setting).Error; err != nil {
		// Not found - return nil (no saved settings yet)
		return nil, nil
	}

	return loadOIDCSettingsPayload(setting.Value)
}

// SaveOIDCSettings persists the OIDC form settings.
func (s *panelSettingsService) SaveOIDCSettings(actorUserID uint, payload *OIDCSettingsPayload) error {
	if err := RequireAdmin(actorUserID); err != nil {
		return err
	}

	data, err := marshalOIDCSettingsPayload(payload)
	if err != nil {
		return serializer.NewError(serializer.CodeInternalErr, "failed to serialize OIDC settings", err)
	}

	var setting model.PanelSetting
	result := model.DB.Where("key = ?", panelSettingKeyOIDC).First(&setting)
	if result.Error != nil {
		// Create new
		setting = model.PanelSetting{
			Key:   panelSettingKeyOIDC,
			Value: string(data),
		}
		return model.DB.Create(&setting).Error
	}
	// Update existing
	setting.Value = string(data)
	return model.DB.Save(&setting).Error
}

// IsOIDCEnabled returns true if either the saved OIDC settings or the built-in OIDC is enabled.
func (s *panelSettingsService) IsOIDCEnabled() bool {
	// Check saved OIDC form settings
	var setting model.PanelSetting
	if err := model.DB.Where("key = ?", panelSettingKeyOIDC).First(&setting).Error; err == nil {
		if payload, err := loadOIDCSettingsPayload(setting.Value); err == nil && payload != nil && payload.Enabled {
			return true
		}
	}
	// Check built-in OIDC
	var client model.OauthClient
	if err := model.DB.Where("client_id = ?", builtinOIDCClientID).First(&client).Error; err == nil {
		return true
	}
	return false
}

// IsThirdPartyOIDCEnabled returns true only if a third-party (external) OIDC provider is configured.
// Built-in OIDC still uses panel passwords, so this distinction matters for password requirements.
func (s *panelSettingsService) IsThirdPartyOIDCEnabled() bool {
	var setting model.PanelSetting
	if err := model.DB.Where("key = ?", panelSettingKeyOIDC).First(&setting).Error; err == nil {
		if payload, err := loadOIDCSettingsPayload(setting.Value); err == nil && payload != nil && payload.Enabled {
			return true
		}
	}
	return false
}

// IsBuiltinOIDCEnabled returns true only if the built-in OIDC provider is configured.
func (s *panelSettingsService) IsBuiltinOIDCEnabled() bool {
	var client model.OauthClient
	if err := model.DB.Where("client_id = ?", builtinOIDCClientID).First(&client).Error; err == nil {
		return true
	}
	return false
}

func resolveHeadscaleOIDCMode(thirdParty, builtin bool) string {
	switch {
	case thirdParty && builtin:
		return "hybrid_oidc"
	case thirdParty:
		return "external_oidc"
	case builtin:
		return "builtin_oidc"
	default:
		return "direct"
	}
}

// HeadscaleOIDCMode describes how Headscale identities are currently managed.
func (s *panelSettingsService) HeadscaleOIDCMode() string {
	return resolveHeadscaleOIDCMode(s.IsThirdPartyOIDCEnabled(), s.IsBuiltinOIDCEnabled())
}

const builtinOIDCClientID = "headscale-builtin"
const builtinOIDCClientName = "Headscale Built-in OIDC"

// GetBuiltinOIDC returns the built-in OIDC configuration if it exists.
func (s *panelSettingsService) GetBuiltinOIDC(actorUserID uint) (*BuiltinOIDCConfig, error) {
	if err := RequireAdmin(actorUserID); err != nil {
		return nil, err
	}

	issuer := strings.TrimRight(conf.Conf.System.BaseURL, "/")
	if issuer == "" {
		return &BuiltinOIDCConfig{Enabled: false}, nil
	}

	var client model.OauthClient
	if err := model.DB.Where("client_id = ?", builtinOIDCClientID).First(&client).Error; err != nil {
		return &BuiltinOIDCConfig{Enabled: false, Issuer: issuer}, nil
	}

	return &BuiltinOIDCConfig{
		Enabled:  true,
		Issuer:   issuer,
		ClientID: client.ClientID,
		Scope:    []string{"openid", "profile", "email"},
	}, nil
}

// EnableBuiltinOIDC creates (or retrieves) the built-in OAuth client and returns the OIDC config.
func (s *panelSettingsService) EnableBuiltinOIDC(actorUserID uint) (*BuiltinOIDCConfig, error) {
	if err := RequireAdmin(actorUserID); err != nil {
		return nil, err
	}

	issuer := strings.TrimRight(conf.Conf.System.BaseURL, "/")
	if issuer == "" {
		return nil, serializer.NewError(serializer.CodeParamErr, "请先在环境变量中配置 BASE_URL", nil)
	}

	var client model.OauthClient
	err := model.DB.Where("client_id = ?", builtinOIDCClientID).First(&client).Error
	if err != nil {
		// Generate a secure random secret
		secretBytes := make([]byte, 32)
		if _, err := rand.Read(secretBytes); err != nil {
			return nil, serializer.NewError(serializer.CodeInternalErr, "生成密钥失败", err)
		}
		plainSecret := hex.EncodeToString(secretBytes)

		hashedSecret, err := hashOAuthClientSecret(plainSecret)
		if err != nil {
			return nil, serializer.NewError(serializer.CodeInternalErr, "哈希密钥失败", err)
		}

		redirectURI := issuer + "/panel/api/v1/auth/oidc/callback"
		client = model.OauthClient{
			ClientID:         builtinOIDCClientID,
			ClientSecretHash: hashedSecret,
			RedirectURIs:     redirectURI,
			Name:             builtinOIDCClientName,
		}
		if err := model.DB.Create(&client).Error; err != nil {
			return nil, serializer.ErrDatabase.WithError(err)
		}

		return &BuiltinOIDCConfig{
			Enabled:      true,
			Issuer:       issuer,
			ClientID:     client.ClientID,
			ClientSecret: plainSecret,
			Scope:        []string{"openid", "profile", "email"},
		}, nil
	}

	// Client already exists - regenerate secret so user can see it
	secretBytes := make([]byte, 32)
	if _, err := rand.Read(secretBytes); err != nil {
		return nil, serializer.NewError(serializer.CodeInternalErr, "生成密钥失败", err)
	}
	plainSecret := hex.EncodeToString(secretBytes)

	hashedSecret, err := hashOAuthClientSecret(plainSecret)
	if err != nil {
		return nil, serializer.NewError(serializer.CodeInternalErr, "哈希密钥失败", err)
	}

	client.ClientSecretHash = hashedSecret
	client.RedirectURIs = issuer + "/panel/api/v1/auth/oidc/callback"
	if err := model.DB.Save(&client).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
	}

	return &BuiltinOIDCConfig{
		Enabled:      true,
		Issuer:       issuer,
		ClientID:     client.ClientID,
		ClientSecret: plainSecret,
		Scope:        []string{"openid", "profile", "email"},
	}, nil
}

func marshalOIDCSettingsPayload(payload *OIDCSettingsPayload) ([]byte, error) {
	if payload == nil {
		return json.Marshal((*persistedOIDCSettingsPayload)(nil))
	}

	encryptedSecret, err := encryptPanelSecret(payload.ClientSecret)
	if err != nil {
		return nil, err
	}

	persisted := persistedOIDCSettingsPayload{
		Enabled:                    payload.Enabled,
		OnlyStartIfOIDCIsAvailable: payload.OnlyStartIfOIDCIsAvailable,
		Issuer:                     payload.Issuer,
		ClientID:                   payload.ClientID,
		ClientSecretEncrypted:      encryptedSecret,
		ClientSecretPath:           payload.ClientSecretPath,
		Scope:                      payload.Scope,
		EmailVerifiedRequired:      payload.EmailVerifiedRequired,
		AllowedDomains:             payload.AllowedDomains,
		AllowedUsers:               payload.AllowedUsers,
		AllowedGroups:              payload.AllowedGroups,
		StripEmailDomain:           payload.StripEmailDomain,
		Expiry:                     payload.Expiry,
		UseExpiryFromToken:         payload.UseExpiryFromToken,
		PKCEEnabled:                payload.PKCEEnabled,
		PKCEMethod:                 payload.PKCEMethod,
	}

	return json.Marshal(&persisted)
}

func loadOIDCSettingsPayload(raw string) (*OIDCSettingsPayload, error) {
	var persisted persistedOIDCSettingsPayload
	if err := json.Unmarshal([]byte(raw), &persisted); err != nil {
		return nil, serializer.NewError(serializer.CodeInternalErr, "failed to parse saved OIDC settings", err)
	}

	clientSecret, err := decryptPanelSecret(persisted.ClientSecretEncrypted, persisted.ClientSecret)
	if err != nil {
		return nil, serializer.NewError(serializer.CodeInternalErr, "failed to decrypt saved OIDC settings", err)
	}

	return &OIDCSettingsPayload{
		Enabled:                    persisted.Enabled,
		OnlyStartIfOIDCIsAvailable: persisted.OnlyStartIfOIDCIsAvailable,
		Issuer:                     persisted.Issuer,
		ClientID:                   persisted.ClientID,
		ClientSecret:               clientSecret,
		ClientSecretPath:           persisted.ClientSecretPath,
		Scope:                      persisted.Scope,
		EmailVerifiedRequired:      persisted.EmailVerifiedRequired,
		AllowedDomains:             persisted.AllowedDomains,
		AllowedUsers:               persisted.AllowedUsers,
		AllowedGroups:              persisted.AllowedGroups,
		StripEmailDomain:           persisted.StripEmailDomain,
		Expiry:                     persisted.Expiry,
		UseExpiryFromToken:         persisted.UseExpiryFromToken,
		PKCEEnabled:                persisted.PKCEEnabled,
		PKCEMethod:                 persisted.PKCEMethod,
	}, nil
}

func encryptPanelSecret(plain string) (string, error) {
	normalized := strings.TrimSpace(plain)
	if normalized == "" {
		return "", nil
	}

	block, err := aes.NewCipher(panelSettingsKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(normalized), nil)
	return base64.RawStdEncoding.EncodeToString(ciphertext), nil
}

func decryptPanelSecret(encrypted string, legacyPlain string) (string, error) {
	if strings.TrimSpace(encrypted) == "" {
		return legacyPlain, nil
	}

	raw, err := base64.RawStdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(panelSettingsKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("encrypted payload too short")
	}

	nonce := raw[:gcm.NonceSize()]
	ciphertext := raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func panelSettingsKey() []byte {
	sum := sha256.Sum256([]byte(conf.Conf.JWT.Secret))
	return sum[:]
}
