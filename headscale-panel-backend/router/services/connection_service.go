package services

import (
	"context"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
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

// GenerateConnectionCommands generates connection commands for selected machines
func (s *connectionService) GenerateConnectionCommands(actorUserID uint, machineIDs []string, platform string) ([]ConnectionCommand, error) {
	return s.GenerateConnectionCommandsWithContext(context.Background(), actorUserID, machineIDs, platform)
}

func (s *connectionService) GenerateConnectionCommandsWithContext(ctx context.Context, actorUserID uint, machineIDs []string, platform string) ([]ConnectionCommand, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:list"); err != nil {
		return nil, err
	}

	if len(machineIDs) == 0 {
		return nil, fmt.Errorf("no machines selected")
	}

	var commands []ConnectionCommand

	// Get Headscale server URL
	serverURL := conf.Conf.System.BaseURL
	if serverURL == "" {
		serverURL = "https://headscale.example.com"
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}
	if scope.headscaleName == "" {
		return nil, fmt.Errorf("actor has no headscale identity")
	}

	headscaleUserID, err := HeadscaleService.ResolveUserIDByNameWithContext(ctx, scope.headscaleName)
	if err != nil {
		return nil, err
	}
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	authKeyResp, err := client.CreatePreAuthKey(queryCtx, &v1.CreatePreAuthKeyRequest{
		User:       headscaleUserID,
		Reusable:   true,
		Ephemeral:  false,
		Expiration: nil,
	})
	if err != nil {
		return nil, err
	}
	authKey, ok := extractPreAuthKeyString(authKeyResp)
	if !ok || strings.TrimSpace(authKey) == "" {
		return nil, fmt.Errorf("failed to extract generated auth key")
	}

	switch strings.ToLower(platform) {
	case "linux":
		commands = append(commands, s.generateLinuxCommands(serverURL, authKey, machineIDs))
	case "macos":
		commands = append(commands, s.generateMacOSCommands(serverURL, authKey, machineIDs))
	case "windows":
		commands = append(commands, s.generateWindowsCommands(serverURL, authKey, machineIDs))
	case "ios":
		commands = append(commands, s.generateIOSCommands(serverURL, authKey))
	case "android":
		commands = append(commands, s.generateAndroidCommands(serverURL, authKey))
	default:
		return nil, fmt.Errorf("unsupported platform: %s", platform)
	}

	// Add SSH connection commands for selected machines
	sshCommands, err := s.generateSSHCommands(ctx, actorUserID, machineIDs, "user")
	if err == nil && len(sshCommands.Commands) > 0 {
		commands = append(commands, sshCommands)
	}

	return commands, nil
}

func (s *connectionService) generateLinuxCommands(serverURL, authKey string, machineIDs []string) ConnectionCommand {
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

func (s *connectionService) generateMacOSCommands(serverURL, authKey string, machineIDs []string) ConnectionCommand {
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

func (s *connectionService) generateWindowsCommands(serverURL, authKey string, machineIDs []string) ConnectionCommand {
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

func (s *connectionService) generateIOSCommands(serverURL, authKey string) ConnectionCommand {
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

func (s *connectionService) generateAndroidCommands(serverURL, authKey string) ConnectionCommand {
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
		return ConnectionCommand{}, fmt.Errorf("no SSH commands generated")
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
	return "", fmt.Errorf("no SSH command generated")
}

// GeneratePreAuthKey generates a pre-auth key for device registration
func (s *connectionService) GeneratePreAuthKey(actorUserID uint, userID uint, reusable bool, ephemeral bool, expiration string) (string, error) {
	return s.GeneratePreAuthKeyWithContext(context.Background(), actorUserID, userID, reusable, ephemeral, expiration)
}

func (s *connectionService) GeneratePreAuthKeyWithContext(ctx context.Context, actorUserID uint, userID uint, reusable bool, ephemeral bool, expiration string) (string, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:create"); err != nil {
		return "", err
	}
	if err := ensureActorCanAccessPanelUser(actorUserID, userID); err != nil {
		return "", err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	var panelUser model.User
	if err := model.DB.First(&panelUser, userID).Error; err != nil {
		return "", fmt.Errorf("panel user not found: %w", err)
	}

	targetName := strings.TrimSpace(panelUser.HeadscaleName)
	if targetName == "" {
		targetName = strings.TrimSpace(panelUser.Username)
	}
	if targetName == "" {
		return "", fmt.Errorf("panel user %d has no headscale identifier", userID)
	}

	// List users to find the ID
	users, err := headscale.GlobalClient.Service.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if err != nil {
		return "", fmt.Errorf("failed to list users: %w", err)
	}

	var headscaleUserID uint64
	found := false
	for _, u := range users.Users {
		if u.Name == targetName {
			headscaleUserID = u.Id
			found = true
			break
		}
	}

	if !found {
		return "", fmt.Errorf("user not found in headscale: %s", targetName)
	}

	resp, err := HeadscaleService.CreatePreAuthKeyWithContext(queryCtx, actorUserID, headscaleUserID, reusable, ephemeral, expiration)
	if err != nil {
		return "", err
	}

	key, ok := extractPreAuthKeyString(resp)
	if !ok {
		return "", fmt.Errorf("failed to extract generated pre-auth key")
	}
	return key, nil
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
