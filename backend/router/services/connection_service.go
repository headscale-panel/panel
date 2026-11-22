// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"fmt"
	"headscale-panel/internal/network"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"time"
)

type connectionService struct{}

// ConnectionService renders the onboarding commands shown in the UI.
var ConnectionService = &connectionService{}

// ConnectionCommand is one ready-to-paste command block.
type ConnectionCommand struct {
	Platform    string   `json:"platform"`
	Description string   `json:"description"`
	Commands    []string `json:"commands"`

	// ExpiresAt and ShowOnce describe an auth key embedded in the commands.
	// They are surfaced because the key is displayed exactly once and cannot be
	// retrieved again.
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	ShowOnce  bool       `json:"show_once,omitempty"`
}

// IdentityOption is a selectable network identity for the onboarding dropdown.
type IdentityOption struct {
	HSUserID    uint64 `json:"hs_user_id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	PolicyUser  string `json:"policy_username"`
	IsPrimary   bool   `json:"is_primary"`
	Origin      string `json:"origin"`
}

// ListIdentities returns the identities the actor may onboard devices for.
func (s *connectionService) ListIdentities(ctx context.Context, actorUserID uint) ([]IdentityOption, error) {
	if err := RequirePermission(actorUserID, constants.PermNetworkIdentityList); err != nil {
		// A self-service actor may still see their own identities.
		if errSelf := RequirePermission(actorUserID, constants.PermNetworkDeviceCreateSelf); errSelf != nil {
			return nil, err
		}
	}

	snap, err := Network.Snapshot(ctx, currentPanelIssuer())
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	out := make([]IdentityOption, 0, len(snap.Identities))
	for _, ident := range snap.Identities {
		if !scope.AllowsHeadscaleUser(ident.HSUserID) {
			continue
		}
		option := IdentityOption{
			HSUserID:    ident.HSUserID,
			Name:        ident.Name,
			DisplayName: ident.DisplayName,
			PolicyUser:  ident.PolicyUsername,
			Origin:      string(ident.Origin),
		}
		if ident.Binding != nil {
			option.IsPrimary = ident.Binding.IsPrimary
		}
		out = append(out, option)
	}
	return out, nil
}

// GenerateCommands produces the onboarding commands for a platform.
//
// A fresh pre-auth key is minted and embedded, because that is the whole point of
// the command; the key is returned to the caller only once and never stored.
func (s *connectionService) GenerateCommands(ctx context.Context, actorUserID uint, hsUserID uint64, platform string) (*ConnectionCommand, error) {
	if err := ensureActorCanOnboardDevice(actorUserID, hsUserID); err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	expiration := time.Now().Add(24 * time.Hour)
	key, createErr := client.CreatePreAuthKey(queryCtx, hsUserID, false, false, &expiration, nil)
	if createErr != nil {
		return nil, unifyerror.HeadscaleAPIError(createErr)
	}

	loginServer := strings.TrimSpace(conf.Conf.System.BaseURL)
	command := &ConnectionCommand{
		Platform:  strings.ToLower(platform),
		ExpiresAt: key.Expiration,
		ShowOnce:  true,
	}

	switch command.Platform {
	case "windows":
		command.Description = "Run in PowerShell as Administrator"
		command.Commands = []string{
			"tailscale up --login-server " + loginServer + " --authkey " + key.Key,
		}
	case "macos", "ios", "android":
		command.Description = "Install the Tailscale app, then register with this key"
		command.Commands = []string{
			"tailscale up --login-server " + loginServer + " --authkey " + key.Key,
		}
	case "docker":
		command.Description = "Run the official Tailscale container"
		command.Commands = []string{
			"docker run -d --name tailscale \\",
			"  --cap-add NET_ADMIN --device /dev/net/tun \\",
			"  -e TS_AUTHKEY=" + key.Key + " \\",
			"  -e TS_STATE_DIR=/var/lib/tailscale \\",
			"  tailscale/tailscale",
		}
	default:
		command.Platform = "linux"
		command.Description = "Install the client and join the tailnet"
		command.Commands = []string{
			"curl -fsSL https://tailscale.com/install.sh | sh",
			"sudo tailscale up --login-server " + loginServer + " --authkey " + key.Key,
		}
	}

	return command, nil
}

// GenerateSSHCommand renders the ssh invocation for one device.
func (s *connectionService) GenerateSSHCommand(ctx context.Context, actorUserID uint, nodeID uint64, sshUser string) (string, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceRead, constants.PermNetworkDeviceListSelf); err != nil {
		return "", err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return "", err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, nodeID)
	if getErr != nil {
		return "", unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return "", err
	}
	if len(node.IpAddresses) == 0 {
		return "", unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "device has no IP address yet")
	}

	user := strings.TrimSpace(sshUser)
	if user == "" {
		user = "root"
	}
	if !isValidSSHUsername(user) {
		return "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid SSH username")
	}
	return fmt.Sprintf("ssh %s@%s", user, node.IpAddresses[0]), nil
}

func isValidSSHUsername(user string) bool {
	if len(user) == 0 || len(user) > 64 {
		return false
	}
	for i := 0; i < len(user); i++ {
		c := user[i]
		isAlpha := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
		isDigit := c >= '0' && c <= '9'
		isAllowed := isAlpha || isDigit || c == '_' || c == '-' || c == '.'
		if !isAllowed {
			return false
		}
		if i == 0 && c == '-' {
			return false
		}
	}
	return true
}

// CreatePreAuthKeyForIdentity mints a key for an explicit identity.
//
// Unlike GenerateCommands this does not render a command: it exists for the
// "add device" dialog, which wants the bare key.
func (s *connectionService) CreatePreAuthKeyForIdentity(ctx context.Context, actorUserID uint, hsUserID uint64, reusable, ephemeral bool, expiration string) (*hsapi.PreAuthKey, error) {
	if err := ensureActorCanOnboardDevice(actorUserID, hsUserID); err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	expiry, parseErr := parseExpiration(expiration)
	if parseErr != nil {
		return nil, parseErr
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	key, createErr := client.CreatePreAuthKey(queryCtx, hsUserID, reusable, ephemeral, expiry, nil)
	if createErr != nil {
		return nil, unifyerror.HeadscaleAPIError(createErr)
	}
	return key, nil
}

// ensureActorCanOnboardDevice checks the two distinct rights involved: permission
// to create keys, and scope over the identity the key would be issued for.
func ensureActorCanOnboardDevice(actorUserID uint, hsUserID uint64) error {
	if hsUserID == 0 {
		return unifyerror.WrongParam("hs_user_id")
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !scope.AllowsHeadscaleUser(hsUserID) {
		return unifyerror.Forbidden()
	}

	if scope.isAdmin {
		return nil
	}
	if err := RequireAnyPermission(actorUserID,
		constants.PermNetworkKeyCreate,
		constants.PermNetworkKeyCreateSelf); err != nil {
		return err
	}

	// A :self holder may only mint keys for a bound identity with a local
	// binding, which is what the scope check above already established.
	return nil
}

// parseExpiration accepts a Go duration, an RFC3339 timestamp, or empty (never).
func parseExpiration(raw string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	if d, err := time.ParseDuration(raw); err == nil {
		if d <= 0 {
			return nil, unifyerror.WrongParam("expiration")
		}
		at := time.Now().Add(d)
		return &at, nil
	}

	if at, err := time.Parse(time.RFC3339, raw); err == nil {
		return &at, nil
	}
	return nil, unifyerror.WrongParam("expiration")
}

// currentPanelIssuer is the issuer this panel advertises to headscale.
func currentPanelIssuer() string {
	return strings.TrimRight(strings.TrimSpace(conf.Conf.System.BaseURL), "/")
}

// identitySnapshot is a small helper for the device dialogs.
func identitySnapshot(ctx context.Context) (*network.Snapshot, error) {
	return Network.Snapshot(ctx, currentPanelIssuer())
}
