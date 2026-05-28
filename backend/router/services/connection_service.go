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
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/unifyerror"
	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"
	"net/http"
	"strconv"
	"strings"
)

type connectionService struct{}

var ConnectionService = &connectionService{}

type ConnectionCommand struct {
	Platform    string   `json:"platform"`
	Description string   `json:"description"`
	Commands    []string `json:"commands"`
}

type HeadscaleIdentity struct {
	HeadscaleName string `json:"headscale_name"`
	Provider      string `json:"provider"`
	DisplayName   string `json:"display_name"`
}

// ListHeadscaleIdentities returns all headscale identities bound to a panel user.
func (s *connectionService) ListHeadscaleIdentities(userID uint) []HeadscaleIdentity {
	ids := model.GetHeadscaleIDs(userID)
	if len(ids) == 0 {
		return nil
	}
	hsUsers := listHeadscaleUsersByIDs(ids)

	identities := make([]HeadscaleIdentity, 0, len(ids))
	for _, id := range ids {
		if u, ok := hsUsers[id]; ok {
			identities = append(identities, HeadscaleIdentity{
				HeadscaleName: u.Name,
				Provider:      normalizeHeadscaleProvider(u.Provider),
				DisplayName:   u.DisplayName,
			})
		}
	}
	return identities
}

// GenerateConnectionCommands generates connection commands for selected machines.
// headscaleName selects which bound headscale identity to use. If empty, the first binding is used.
func (s *connectionService) GenerateConnectionCommands(actorUserID uint, machineIDs []string, platform string, headscaleName string) ([]ConnectionCommand, error) {
	return s.GenerateConnectionCommandsWithContext(context.Background(), actorUserID, machineIDs, platform, headscaleName)
}

func (s *connectionService) GenerateConnectionCommandsWithContext(ctx context.Context, actorUserID uint, machineIDs []string, platform string, headscaleName string) ([]ConnectionCommand, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:list"); err != nil {
		return nil, err
	}

	if len(machineIDs) == 0 {
		return nil, unifyerror.WrongParam("machine_ids")
	}

	// Resolve headscale identity
	resolvedName, err := s.resolveHeadscaleName(actorUserID, headscaleName)
	if err != nil {
		return nil, err
	}

	// Get Headscale server URL
	serverURL := conf.Conf.System.BaseURL
	if serverURL == "" {
		serverURL = "https://headscale.example.com"
	}

	headscaleUserID, err := HeadscaleService.ResolveUserIDByNameWithContext(ctx, resolvedName)
	if err != nil {
		return nil, err
	}
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, unifyerror.GRPCError(err)
	}

	authKeyResp, grpcErr := client.CreatePreAuthKey(queryCtx, &v1.CreatePreAuthKeyRequest{
		User:       headscaleUserID,
		Reusable:   true,
		Ephemeral:  false,
		Expiration: nil,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	authKey, ok := extractPreAuthKeyString(authKeyResp)
	if !ok || strings.TrimSpace(authKey) == "" {
		return nil, unifyerror.ServerError(fmt.Errorf("failed to extract generated auth key"))
	}

	var commands []ConnectionCommand
	switch strings.ToLower(platform) {
	case "linux":
		commands = append(commands, s.generateLinuxCommands(serverURL, authKey))
	case "macos":
		commands = append(commands, s.generateMacOSCommands(serverURL, authKey))
	case "windows":
		commands = append(commands, s.generateWindowsCommands(serverURL, authKey))
	case "ios":
		commands = append(commands, s.generateIOSCommands(serverURL))
	case "android":
		commands = append(commands, s.generateAndroidCommands(serverURL))
	default:
		return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf("unsupported platform: %s", platform))
	}

	// Add SSH connection commands for selected machines
	sshCommands, err := s.generateSSHCommands(ctx, actorUserID, machineIDs, "user")
	if err == nil && len(sshCommands.Commands) > 0 {
		commands = append(commands, sshCommands)
	}

	return commands, nil
}

func (s *connectionService) generateLinuxCommands(serverURL, authKey string) ConnectionCommand {
	return ConnectionCommand{
		Platform:    "Linux",
		Description: "Install and configure Tailscale on Linux",
		Commands: []string{
			"# Install Tailscale",
			"curl -fsSL https://tailscale.com/install.sh | sh",
			"",
			"# Connect to Headscale",
			fmt.Sprintf("sudo tailscale up --login-server=%s --authkey=%s", serverURL, authKey),
			"",
			"# Check status",
			"tailscale status",
		},
	}
}

func (s *connectionService) generateMacOSCommands(serverURL, authKey string) ConnectionCommand {
	return ConnectionCommand{
		Platform:    "macOS",
		Description: "Install and configure Tailscale on macOS",
		Commands: []string{
			"# Install Tailscale via Homebrew",
			"brew install tailscale",
			"",
			"# Start Tailscale service",
			"sudo tailscaled install-system-daemon",
			"",
			"# Connect to Headscale",
			fmt.Sprintf("tailscale up --login-server=%s --authkey=%s", serverURL, authKey),
			"",
			"# Check status",
			"tailscale status",
		},
	}
}

func (s *connectionService) generateWindowsCommands(serverURL, authKey string) ConnectionCommand {
	return ConnectionCommand{
		Platform:    "Windows",
		Description: "Install and configure Tailscale on Windows",
		Commands: []string{
			"# Download Tailscale installer from https://tailscale.com/download/windows",
			"",
			"# After installation, run in PowerShell:",
			fmt.Sprintf("tailscale up --login-server=%s --authkey=%s", serverURL, authKey),
			"",
			"# Check status",
			"tailscale status",
		},
	}
}

func (s *connectionService) generateIOSCommands(serverURL string) ConnectionCommand {
	return ConnectionCommand{
		Platform:    "iOS",
		Description: "Configure Tailscale on iOS",
		Commands: []string{
			"1. Download Tailscale from App Store",
			"2. Open the app and tap 'Use a different server'",
			fmt.Sprintf("3. Enter server URL: %s", serverURL),
			"4. Log in with your credentials",
		},
	}
}

func (s *connectionService) generateAndroidCommands(serverURL string) ConnectionCommand {
	return ConnectionCommand{
		Platform:    "Android",
		Description: "Configure Tailscale on Android",
		Commands: []string{
			"1. Download Tailscale from Google Play Store",
			"2. Open the app and tap the three dots menu",
			"3. Select 'Use a different server'",
			fmt.Sprintf("4. Enter server URL: %s", serverURL),
			"5. Log in with your credentials",
		},
	}
}

func (s *connectionService) generateSSHCommands(ctx context.Context, actorUserID uint, machineIDs []string, sshUser string) (ConnectionCommand, error) {
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	if strings.TrimSpace(sshUser) == "" {
		sshUser = "user"
	}

	var commands []string
	commands = append(commands, "# SSH to selected devices:")
	commands = append(commands, "")

	for _, machineIDStr := range machineIDs {
		machineID, err := strconv.ParseUint(machineIDStr, 10, 64)
		if err != nil {
			continue
		}
		node, err := headscale.GlobalClient.Service.GetNode(queryCtx, &v1.GetNodeRequest{
			NodeId: machineID,
		})
		if err != nil {
			continue
		}
		if err := ensureActorCanAccessNode(actorUserID, node.Node); err != nil {
			continue
		}

		if len(node.Node.IpAddresses) > 0 {
			ipAddress := node.Node.IpAddresses[0]
			commands = append(commands, fmt.Sprintf("# Connect to %s", node.Node.Name))
			commands = append(commands, fmt.Sprintf("ssh %s@%s", sshUser, ipAddress))
			commands = append(commands, "")
		}
	}

	if len(commands) <= 2 {
		return ConnectionCommand{}, unifyerror.NotFound()
	}

	return ConnectionCommand{
		Platform:    "SSH",
		Description: "SSH connection commands",
		Commands:    commands,
	}, nil
}

func (s *connectionService) GenerateSSHCommandWithContext(ctx context.Context, actorUserID uint, machineID uint64, sshUser string) (string, error) {
	commandSet, err := s.generateSSHCommands(ctx, actorUserID, []string{strconv.FormatUint(machineID, 10)}, sshUser)
	if err != nil {
		return "", err
	}
	for _, command := range commandSet.Commands {
		trimmed := strings.TrimSpace(command)
		if strings.HasPrefix(trimmed, "ssh ") {
			return trimmed, nil
		}
	}
	return "", unifyerror.NotFound()
}

// GeneratePreAuthKey generates a pre-auth key for device registration.
// headscaleName selects which bound headscale identity to use. If empty, the first binding is used.
func (s *connectionService) GeneratePreAuthKey(actorUserID uint, userID uint, reusable bool, ephemeral bool, expiration string, headscaleName string) (string, error) {
	return s.GeneratePreAuthKeyWithContext(context.Background(), actorUserID, userID, reusable, ephemeral, expiration, headscaleName)
}

func (s *connectionService) GeneratePreAuthKeyWithContext(ctx context.Context, actorUserID uint, userID uint, reusable bool, ephemeral bool, expiration string, headscaleName string) (string, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:create"); err != nil {
		return "", err
	}
	if err := ensureActorCanAccessPanelUser(actorUserID, userID); err != nil {
		return "", err
	}

	// Resolve headscale identity
	resolvedName, err := s.resolveHeadscaleName(userID, headscaleName)
	if err != nil {
		return "", err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	headscaleUserID, err := HeadscaleService.ResolveUserIDByNameWithContext(queryCtx, resolvedName)
	if err != nil {
		return "", unifyerror.NotFound()
	}

	resp, err := HeadscaleService.CreatePreAuthKeyWithContext(queryCtx, actorUserID, headscaleUserID, reusable, ephemeral, expiration)
	if err != nil {
		return "", err
	}

	key, ok := extractPreAuthKeyString(resp)
	if !ok {
		return "", unifyerror.ServerError(fmt.Errorf("failed to extract generated pre-auth key"))
	}
	return key, nil
}

// resolveHeadscaleName resolves which headscale identity to use.
// If headscaleName is provided, validates it exists in the user's bindings.
// If empty, returns the first binding's name, or falls back to the panel username.
func (s *connectionService) resolveHeadscaleName(userID uint, headscaleName string) (string, error) {
	ids := model.GetHeadscaleIDs(userID)
	if len(ids) == 0 {
		// Fallback to panel username
		var user model.User
		if err := model.DB.First(&user, userID).Error; err == nil {
			if name := strings.TrimSpace(user.Username); name != "" {
				return name, nil
			}
		}
		return "", unifyerror.NotFound()
	}

	hsUsers := listHeadscaleUsersByIDs(ids)

	if headscaleName != "" {
		for _, u := range hsUsers {
			if strings.EqualFold(strings.TrimSpace(u.Name), strings.TrimSpace(headscaleName)) {
				return strings.TrimSpace(u.Name), nil
			}
		}
		return "", unifyerror.NotFound()
	}

	// Return the first one
	for _, id := range ids {
		if u, ok := hsUsers[id]; ok {
			return strings.TrimSpace(u.Name), nil
		}
	}
	return "", unifyerror.ServerError(fmt.Errorf("failed to resolve headscale identity"))
}

func extractPreAuthKeyString(value interface{}) (string, bool) {
	switch typed := value.(type) {
	case *v1.PreAuthKey:
		if typed == nil {
			return "", false
		}
		return typed.Key, true
	case v1.PreAuthKey:
		return typed.Key, true
	default:
		return "", false
	}
}
