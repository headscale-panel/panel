package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
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

	// Persist to .env
	if err := writePanelConnectionEnv(grpcAddr, effectiveAPIKey, insecure); err != nil {
		conf.Conf.Headscale = old
		return serializer.NewError(serializer.CodeFileSystemError, "保存连接设置失败", err)
	}

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

// SyncDataFromHeadscale syncs resources/groups from Headscale ACL into local DB.
func (s *panelSettingsService) SyncDataFromHeadscale(actorUserID uint) error {
	if err := RequireAdmin(actorUserID); err != nil {
		return err
	}

	return HeadscaleService.SyncACL()
}

func writePanelConnectionEnv(grpcAddr, apiKey string, insecureMode bool) error {
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

	setLine("HEADSCALE_GRPC_ADDR", grpcAddr)
	setLine("HEADSCALE_API_KEY", apiKey)
	if insecureMode {
		setLine("HEADSCALE_INSECURE", "true")
	} else {
		setLine("HEADSCALE_INSECURE", "false")
	}

	content := strings.Join(lines, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}

	return os.WriteFile(path, []byte(content), 0644)
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

	var payload OIDCSettingsPayload
	if err := json.Unmarshal([]byte(setting.Value), &payload); err != nil {
		return nil, serializer.NewError(serializer.CodeInternalErr, "failed to parse saved OIDC settings", err)
	}
	return &payload, nil
}

// SaveOIDCSettings persists the OIDC form settings.
func (s *panelSettingsService) SaveOIDCSettings(actorUserID uint, payload *OIDCSettingsPayload) error {
	if err := RequireAdmin(actorUserID); err != nil {
		return err
	}

	data, err := json.Marshal(payload)
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
		var payload OIDCSettingsPayload
		if err := json.Unmarshal([]byte(setting.Value), &payload); err == nil && payload.Enabled {
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
		var payload OIDCSettingsPayload
		if err := json.Unmarshal([]byte(setting.Value), &payload); err == nil && payload.Enabled {
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

		redirectURI := issuer + "/api/v1/auth/oidc/callback"
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
	client.RedirectURIs = issuer + "/api/v1/auth/oidc/callback"
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
