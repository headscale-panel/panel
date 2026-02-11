package services

import (
	"context"
	"encoding/json"
	"fmt"
	"headscale-panel/pkg/utils/serializer"
	"io"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

type DockerService struct {
	client *client.Client
}

func (s *DockerService) requirePermission(actorUserID uint, permission string) error {
	if err := RequireAdmin(actorUserID); err != nil {
		return err
	}

	return RequirePermission(actorUserID, permission)
}

type deployImagePolicy struct {
	AllowedContainerPorts map[string]struct{}
	AllowedHostPathPrefix []string
	AllowedContainerPaths map[string]struct{}
	AllowedEnvKeys        map[string]struct{}
	AllowedCommands       [][]string
}

var (
	containerNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$`)
	envKeyPattern        = regexp.MustCompile(`^[A-Z_][A-Z0-9_]*$`)

	allowedNetworks = map[string]struct{}{
		"private": {},
	}

	allowedRestartPolicies = map[string]container.RestartPolicyMode{
		"unless-stopped": container.RestartPolicyUnlessStopped,
		"always":         container.RestartPolicyAlways,
		"no":             container.RestartPolicyDisabled,
	}

	deployPolicies = map[string]deployImagePolicy{
		"headscale/headscale:stable": {
			AllowedContainerPorts: setOf("8080/tcp", "50443/tcp"),
			AllowedHostPathPrefix: []string{
				"./headscale/config",
				"./headscale/data",
				"./headscale/run",
				"/usr/share/zoneinfo/",
			},
			AllowedContainerPaths: setOf(
				"/etc/headscale",
				"/var/lib/headscale",
				"/var/run/headscale",
				"/etc/localtime",
			),
			AllowedEnvKeys:  map[string]struct{}{},
			AllowedCommands: [][]string{{"serve"}},
		},
		"headscale/headscale:latest": {
			AllowedContainerPorts: setOf("8080/tcp", "50443/tcp"),
			AllowedHostPathPrefix: []string{
				"./headscale/config",
				"./headscale/data",
				"./headscale/run",
				"/usr/share/zoneinfo/",
			},
			AllowedContainerPaths: setOf(
				"/etc/headscale",
				"/var/lib/headscale",
				"/var/run/headscale",
				"/etc/localtime",
			),
			AllowedEnvKeys:  map[string]struct{}{},
			AllowedCommands: [][]string{{"serve"}},
		},
		"fredliang/derper": {
			AllowedContainerPorts: setOf("6060/tcp", "3478/udp"),
			AllowedHostPathPrefix: []string{
				"/var/run/tailscale",
				"/usr/share/zoneinfo/",
			},
			AllowedContainerPaths: setOf(
				"/var/run/tailscale",
				"/etc/localtime",
			),
			AllowedEnvKeys: setOf(
				"DERP_DOMAIN",
				"DERP_ADDR",
				"DERP_CERT_MODE",
				"DERP_VERIFY_CLIENTS",
			),
			AllowedCommands: nil,
		},
	}
)

type ContainerInfo struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Image   string            `json:"image"`
	Status  string            `json:"status"`
	State   string            `json:"state"`
	Created time.Time         `json:"created"`
	Ports   []string          `json:"ports"`
	Labels  map[string]string `json:"labels"`
}

type ContainerStats struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryUsage   uint64  `json:"memory_usage"`
	MemoryLimit   uint64  `json:"memory_limit"`
	MemoryPercent float64 `json:"memory_percent"`
	NetworkRx     uint64  `json:"network_rx"`
	NetworkTx     uint64  `json:"network_tx"`
}

func NewDockerService() (*DockerService, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	return &DockerService{client: cli}, nil
}

// GetContainer gets information about a specific container
func (s *DockerService) GetContainer(actorUserID uint, containerName string) (*ContainerInfo, error) {
	if err := s.requirePermission(actorUserID, "docker:container:get"); err != nil {
		return nil, err
	}

	ctx := context.Background()

	containers, err := s.client.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	for _, c := range containers {
		for _, name := range c.Names {
			if name == "/"+containerName || name == containerName {
				return &ContainerInfo{
					ID:      c.ID[:12],
					Name:    name,
					Image:   c.Image,
					Status:  c.Status,
					State:   c.State,
					Created: time.Unix(c.Created, 0),
					Ports:   formatPorts(c.Ports),
					Labels:  c.Labels,
				}, nil
			}
		}
	}

	return nil, fmt.Errorf("container not found: %s", containerName)
}

func (s *DockerService) getContainerByName(containerName string) (*ContainerInfo, error) {
	ctx := context.Background()

	containers, err := s.client.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	for _, c := range containers {
		for _, name := range c.Names {
			if name == "/"+containerName || name == containerName {
				return &ContainerInfo{
					ID:      c.ID[:12],
					Name:    name,
					Image:   c.Image,
					Status:  c.Status,
					State:   c.State,
					Created: time.Unix(c.Created, 0),
					Ports:   formatPorts(c.Ports),
					Labels:  c.Labels,
				}, nil
			}
		}
	}

	return nil, fmt.Errorf("container not found: %s", containerName)
}

// StartContainer starts a container
func (s *DockerService) StartContainer(actorUserID uint, containerName string) error {
	if err := s.requirePermission(actorUserID, "docker:container:start"); err != nil {
		return err
	}

	ctx := context.Background()

	containerObj, err := s.getContainerByName(containerName)
	if err != nil {
		return err
	}

	return s.client.ContainerStart(ctx, containerObj.ID, container.StartOptions{})
}

// StopContainer stops a container
func (s *DockerService) StopContainer(actorUserID uint, containerName string) error {
	if err := s.requirePermission(actorUserID, "docker:container:stop"); err != nil {
		return err
	}

	ctx := context.Background()

	containerObj, err := s.getContainerByName(containerName)
	if err != nil {
		return err
	}

	timeout := 10
	return s.client.ContainerStop(ctx, containerObj.ID, container.StopOptions{Timeout: &timeout})
}

// RestartContainer restarts a container
func (s *DockerService) RestartContainer(actorUserID uint, containerName string) error {
	if err := s.requirePermission(actorUserID, "docker:container:restart"); err != nil {
		return err
	}

	ctx := context.Background()

	containerObj, err := s.getContainerByName(containerName)
	if err != nil {
		return err
	}

	timeout := 10
	return s.client.ContainerRestart(ctx, containerObj.ID, container.StopOptions{Timeout: &timeout})
}

// GetContainerLogs gets logs from a container
func (s *DockerService) GetContainerLogs(actorUserID uint, containerName string, tail int) (string, error) {
	if err := s.requirePermission(actorUserID, "docker:container:logs"); err != nil {
		return "", err
	}

	ctx := context.Background()

	containerObj, err := s.getContainerByName(containerName)
	if err != nil {
		return "", err
	}

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", tail),
		Timestamps: true,
	}

	logs, err := s.client.ContainerLogs(ctx, containerObj.ID, options)
	if err != nil {
		return "", fmt.Errorf("failed to get logs: %w", err)
	}
	defer logs.Close()

	logBytes, err := io.ReadAll(logs)
	if err != nil {
		return "", fmt.Errorf("failed to read logs: %w", err)
	}

	return string(logBytes), nil
}

// GetContainerStats gets resource usage statistics for a container
func (s *DockerService) GetContainerStats(actorUserID uint, containerName string) (*ContainerStats, error) {
	if err := s.requirePermission(actorUserID, "docker:container:stats"); err != nil {
		return nil, err
	}

	ctx := context.Background()

	container, err := s.getContainerByName(containerName)
	if err != nil {
		return nil, err
	}

	stats, err := s.client.ContainerStats(ctx, container.ID, false)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats: %w", err)
	}
	defer stats.Body.Close()

	var v types.StatsJSON
	if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
		return nil, fmt.Errorf("failed to decode stats: %w", err)
	}

	// Calculate CPU percentage
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - v.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)
	cpuPercent := 0.0
	if systemDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(len(v.CPUStats.CPUUsage.PercpuUsage)) * 100.0
	}

	// Calculate memory percentage
	memPercent := 0.0
	if v.MemoryStats.Limit > 0 {
		memPercent = float64(v.MemoryStats.Usage) / float64(v.MemoryStats.Limit) * 100.0
	}

	// Calculate network stats
	var networkRx, networkTx uint64
	for _, network := range v.Networks {
		networkRx += network.RxBytes
		networkTx += network.TxBytes
	}

	return &ContainerStats{
		CPUPercent:    cpuPercent,
		MemoryUsage:   v.MemoryStats.Usage,
		MemoryLimit:   v.MemoryStats.Limit,
		MemoryPercent: memPercent,
		NetworkRx:     networkRx,
		NetworkTx:     networkTx,
	}, nil
}

// ListContainers lists all containers
func (s *DockerService) ListContainers(actorUserID uint) ([]*ContainerInfo, error) {
	if err := s.requirePermission(actorUserID, "docker:container:list"); err != nil {
		return nil, err
	}

	ctx := context.Background()

	containers, err := s.client.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	var result []*ContainerInfo
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}

		result = append(result, &ContainerInfo{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			State:   c.State,
			Created: time.Unix(c.Created, 0),
			Ports:   formatPorts(c.Ports),
			Labels:  c.Labels,
		})
	}

	return result, nil
}

// DeployRequest describes a container to create and start.
type DeployRequest struct {
	Image         string            `json:"image"`
	ContainerName string            `json:"container_name"`
	Ports         map[string]string `json:"ports"`          // host:container e.g. {"28080":"8080", "28081/tcp":"50443"}
	Volumes       map[string]string `json:"volumes"`        // host_path:container_path
	Env           map[string]string `json:"env"`            // KEY=VALUE
	Command       []string          `json:"command"`        // optional CMD override
	NetworkName   string            `json:"network_name"`   // optional docker network
	RestartPolicy string            `json:"restart_policy"` // "unless-stopped", "always", etc.
}

// DeployProgress is sent during the deploy process.
type DeployProgress struct {
	Step    string `json:"step"` // "pull" | "create" | "network" | "start" | "done"
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// PullImage pulls a Docker image and returns progress messages.
func (s *DockerService) PullImage(imageName string) ([]DeployProgress, error) {
	ctx := context.Background()
	var progress []DeployProgress

	reader, err := s.client.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to pull image %s: %w", imageName, err)
	}
	defer reader.Close()

	// Consume the pull output
	decoder := json.NewDecoder(reader)
	var lastStatus string
	for {
		var msg struct {
			Status   string `json:"status"`
			Progress string `json:"progress"`
			Error    string `json:"error"`
		}
		if err := decoder.Decode(&msg); err != nil {
			if err == io.EOF {
				break
			}
			break
		}
		if msg.Error != "" {
			return progress, fmt.Errorf("pull error: %s", msg.Error)
		}
		if msg.Status != lastStatus {
			progress = append(progress, DeployProgress{Step: "pull", Message: msg.Status})
			lastStatus = msg.Status
		}
	}

	return progress, nil
}

// EnsureNetwork creates a docker network if it doesn't exist.
func (s *DockerService) EnsureNetwork(networkName string) error {
	ctx := context.Background()

	networks, err := s.client.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list networks: %w", err)
	}

	for _, n := range networks {
		if n.Name == networkName {
			return nil // already exists
		}
	}

	_, err = s.client.NetworkCreate(ctx, networkName, network.CreateOptions{
		Driver: "bridge",
	})
	if err != nil {
		return fmt.Errorf("failed to create network %s: %w", networkName, err)
	}
	return nil
}

// RemoveContainer force-removes a container by name (ignores if not found).
func (s *DockerService) RemoveContainer(containerName string) error {
	ctx := context.Background()
	c, err := s.getContainerByName(containerName)
	if err != nil {
		return nil // not found, OK
	}
	return s.client.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
}

// DeployContainer creates and starts a container based on DeployRequest.
func (s *DockerService) DeployContainer(actorUserID uint, req DeployRequest) ([]DeployProgress, error) {
	if err := s.requirePermission(actorUserID, "docker:container:deploy"); err != nil {
		return nil, err
	}

	return s.deployContainer(req)
}

// DeployContainerUnsafe deploys a container without auth checks.
// This is only for setup flow before any user account exists.
func (s *DockerService) DeployContainerUnsafe(req DeployRequest) ([]DeployProgress, error) {
	return s.deployContainer(req)
}

func (s *DockerService) deployContainer(req DeployRequest) ([]DeployProgress, error) {
	ctx := context.Background()
	var progress []DeployProgress

	policy, normalizedReq, err := validateAndNormalizeDeployRequest(req)
	if err != nil {
		return progress, err
	}
	req = normalizedReq

	// 1. Pull image
	pullProgress, err := s.PullImage(req.Image)
	progress = append(progress, pullProgress...)
	if err != nil {
		return progress, err
	}
	progress = append(progress, DeployProgress{Step: "pull", Message: fmt.Sprintf("Image %s ready", req.Image)})

	// 2. Remove existing container with same name
	_ = s.RemoveContainer(req.ContainerName)

	// 3. Ensure network
	if req.NetworkName != "" {
		if err := s.EnsureNetwork(req.NetworkName); err != nil {
			return progress, err
		}
		progress = append(progress, DeployProgress{Step: "network", Message: fmt.Sprintf("Network %s ready", req.NetworkName)})
	}

	// 4. Build container config
	env := make([]string, 0, len(req.Env))
	for k, v := range req.Env {
		env = append(env, k+"="+v)
	}

	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}
	for hostPort, containerPort := range req.Ports {
		hostNum, proto, err := parsePortMappingKey(hostPort)
		if err != nil {
			return progress, err
		}
		containerNum, containerProto, err := parseContainerPort(containerPort, proto)
		if err != nil {
			return progress, err
		}
		if containerProto != proto {
			return progress, fmt.Errorf("container port protocol mismatch: host=%s container=%s", hostPort, containerPort)
		}

		portKey := fmt.Sprintf("%d/%s", containerNum, containerProto)
		if _, ok := policy.AllowedContainerPorts[portKey]; !ok {
			return progress, fmt.Errorf("container port not allowed: %s", portKey)
		}

		cPort := nat.Port(portKey)
		exposedPorts[cPort] = struct{}{}
		portBindings[cPort] = []nat.PortBinding{{HostPort: strconv.Itoa(hostNum)}}
	}

	mounts := make([]mount.Mount, 0, len(req.Volumes))
	for hostPath, containerPath := range req.Volumes {
		targetPath, readOnly, err := parseContainerMountTarget(containerPath)
		if err != nil {
			return progress, err
		}

		mounts = append(mounts, mount.Mount{
			Type:     mount.TypeBind,
			Source:   hostPath,
			Target:   targetPath,
			ReadOnly: readOnly,
		})
	}

	// Determine restart policy
	restartMode, ok := allowedRestartPolicies[req.RestartPolicy]
	if !ok {
		restartMode = container.RestartPolicyUnlessStopped
	}
	restartPolicy := container.RestartPolicy{Name: restartMode}

	containerConfig := &container.Config{
		Image:        req.Image,
		Env:          env,
		ExposedPorts: exposedPorts,
		Cmd:          req.Command,
	}

	hostConfig := &container.HostConfig{
		PortBindings:  portBindings,
		Mounts:        mounts,
		RestartPolicy: restartPolicy,
	}

	var networkingConfig *network.NetworkingConfig
	if req.NetworkName != "" {
		networkingConfig = &network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				req.NetworkName: {},
			},
		}
	}

	progress = append(progress, DeployProgress{Step: "create", Message: fmt.Sprintf("Creating container %s ...", req.ContainerName)})

	resp, err := s.client.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, nil, req.ContainerName)
	if err != nil {
		return progress, fmt.Errorf("failed to create container: %w", err)
	}

	progress = append(progress, DeployProgress{Step: "create", Message: fmt.Sprintf("Container created: %s", resp.ID[:12])})

	// 5. Start container
	progress = append(progress, DeployProgress{Step: "start", Message: "Starting container ..."})
	if err := s.client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return progress, fmt.Errorf("failed to start container: %w", err)
	}

	progress = append(progress, DeployProgress{Step: "done", Message: fmt.Sprintf("Container %s is running", req.ContainerName)})
	return progress, nil
}

func formatPorts(ports []types.Port) []string {
	var result []string
	for _, port := range ports {
		if port.PublicPort > 0 {
			result = append(result, fmt.Sprintf("%d:%d/%s", port.PublicPort, port.PrivatePort, port.Type))
		} else {
			result = append(result, fmt.Sprintf("%d/%s", port.PrivatePort, port.Type))
		}
	}
	return result
}

func validateAndNormalizeDeployRequest(req DeployRequest) (deployImagePolicy, DeployRequest, error) {
	req.Image = strings.TrimSpace(req.Image)
	policy, ok := deployPolicies[req.Image]
	if !ok {
		return deployImagePolicy{}, req, serializer.NewError(serializer.CodeParamErr, "illegal image", nil)
	}

	req.ContainerName = strings.TrimSpace(req.ContainerName)
	if !containerNamePattern.MatchString(req.ContainerName) {
		return deployImagePolicy{}, req, serializer.NewError(serializer.CodeParamErr, "illegal container name", nil)
	}

	req.NetworkName = strings.TrimSpace(req.NetworkName)
	if req.NetworkName != "" {
		if _, ok := allowedNetworks[req.NetworkName]; !ok {
			return deployImagePolicy{}, req, serializer.NewError(serializer.CodeParamErr, "illegal network", nil)
		}
	}

	restartPolicy := strings.ToLower(strings.TrimSpace(req.RestartPolicy))
	if restartPolicy == "" {
		restartPolicy = "unless-stopped"
	}
	if _, ok := allowedRestartPolicies[restartPolicy]; !ok {
		return deployImagePolicy{}, req, serializer.NewError(serializer.CodeParamErr, "illegal restart policy", nil)
	}
	req.RestartPolicy = restartPolicy

	normalizedEnv, err := normalizeAndValidateEnv(req.Env, policy)
	if err != nil {
		return deployImagePolicy{}, req, err
	}
	req.Env = normalizedEnv

	if err := validatePorts(req.Ports, policy); err != nil {
		return deployImagePolicy{}, req, err
	}

	normalizedVolumes, err := normalizeAndValidateVolumes(req.Volumes, policy)
	if err != nil {
		return deployImagePolicy{}, req, err
	}
	req.Volumes = normalizedVolumes

	if err := validateCommand(req.Command, policy); err != nil {
		return deployImagePolicy{}, req, err
	}

	return policy, req, nil
}

func normalizeAndValidateEnv(env map[string]string, policy deployImagePolicy) (map[string]string, error) {
	if len(env) == 0 {
		return map[string]string{}, nil
	}

	normalized := make(map[string]string, len(env))
	for key, value := range env {
		normalizedKey := strings.TrimSpace(strings.ToUpper(key))
		if !envKeyPattern.MatchString(normalizedKey) {
			return nil, serializer.NewError(serializer.CodeParamErr, "illegal env key", nil)
		}
		if _, ok := policy.AllowedEnvKeys[normalizedKey]; !ok {
			return nil, serializer.NewError(serializer.CodeParamErr, "env key not allowed", nil)
		}
		if strings.ContainsAny(value, "\x00\r\n") {
			return nil, serializer.NewError(serializer.CodeParamErr, "illegal env value", nil)
		}
		normalized[normalizedKey] = value
	}

	return normalized, nil
}

func validatePorts(ports map[string]string, policy deployImagePolicy) error {
	for hostPortKey, containerPortValue := range ports {
		hostPort, proto, err := parsePortMappingKey(hostPortKey)
		if err != nil {
			return err
		}

		containerPort, containerProto, err := parseContainerPort(containerPortValue, proto)
		if err != nil {
			return err
		}
		if containerProto != proto {
			return serializer.NewError(serializer.CodeParamErr, "protocol mismatch between host and container ports", nil)
		}

		portKey := fmt.Sprintf("%d/%s", containerPort, containerProto)
		if _, ok := policy.AllowedContainerPorts[portKey]; !ok {
			return serializer.NewError(serializer.CodeParamErr, "container port not allowed", nil)
		}

		if hostPort < 1 || hostPort > 65535 {
			return serializer.NewError(serializer.CodeParamErr, "host port out of range", nil)
		}
	}

	return nil
}

func parsePortMappingKey(value string) (int, string, error) {
	raw := strings.ToLower(strings.TrimSpace(value))
	parts := strings.Split(raw, "/")
	if len(parts) > 2 {
		return 0, "", serializer.NewError(serializer.CodeParamErr, "illegal host port format", nil)
	}

	port, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || port < 1 || port > 65535 {
		return 0, "", serializer.NewError(serializer.CodeParamErr, "illegal host port", nil)
	}

	proto := "tcp"
	if len(parts) == 2 {
		proto = strings.TrimSpace(parts[1])
	}
	if proto != "tcp" && proto != "udp" {
		return 0, "", serializer.NewError(serializer.CodeParamErr, "illegal port protocol", nil)
	}

	return port, proto, nil
}

func parseContainerPort(value, defaultProto string) (int, string, error) {
	raw := strings.ToLower(strings.TrimSpace(value))
	parts := strings.Split(raw, "/")
	if len(parts) > 2 {
		return 0, "", serializer.NewError(serializer.CodeParamErr, "illegal container port format", nil)
	}

	port, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || port < 1 || port > 65535 {
		return 0, "", serializer.NewError(serializer.CodeParamErr, "illegal container port", nil)
	}

	proto := defaultProto
	if len(parts) == 2 {
		proto = strings.TrimSpace(parts[1])
	}
	if proto != "tcp" && proto != "udp" {
		return 0, "", serializer.NewError(serializer.CodeParamErr, "illegal container port protocol", nil)
	}

	return port, proto, nil
}

func normalizeAndValidateVolumes(volumes map[string]string, policy deployImagePolicy) (map[string]string, error) {
	normalized := make(map[string]string, len(volumes))

	for hostPath, containerPath := range volumes {
		hostClean, err := normalizeHostMountPath(hostPath)
		if err != nil {
			return nil, err
		}
		if isDangerousHostPath(hostClean) {
			return nil, serializer.NewError(serializer.CodeParamErr, "dangerous host mount is forbidden", nil)
		}
		if !isAllowedHostPath(hostClean, policy.AllowedHostPathPrefix) {
			return nil, serializer.NewError(serializer.CodeParamErr, "host mount path not allowed", nil)
		}

		targetPath, readOnly, err := parseContainerMountTarget(containerPath)
		if err != nil {
			return nil, err
		}
		if _, ok := policy.AllowedContainerPaths[targetPath]; !ok {
			return nil, serializer.NewError(serializer.CodeParamErr, "container mount path not allowed", nil)
		}

		if readOnly {
			normalized[hostClean] = targetPath + ":ro"
		} else {
			normalized[hostClean] = targetPath
		}
	}

	return normalized, nil
}

func normalizeHostMountPath(hostPath string) (string, error) {
	raw := strings.TrimSpace(hostPath)
	if raw == "" {
		return "", serializer.NewError(serializer.CodeParamErr, "empty host mount path", nil)
	}

	if strings.Contains(raw, "\x00") {
		return "", serializer.NewError(serializer.CodeParamErr, "illegal host mount path", nil)
	}

	cleaned := filepath.Clean(raw)
	if cleaned == "." || cleaned == "" {
		return "", serializer.NewError(serializer.CodeParamErr, "illegal host mount path", nil)
	}

	if strings.HasPrefix(cleaned, "..") || strings.Contains(cleaned, "/../") {
		return "", serializer.NewError(serializer.CodeParamErr, "path traversal is not allowed", nil)
	}

	return cleaned, nil
}

func parseContainerMountTarget(raw string) (string, bool, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", false, serializer.NewError(serializer.CodeParamErr, "empty container mount path", nil)
	}

	readOnly := false
	if strings.HasSuffix(strings.ToLower(value), ":ro") {
		readOnly = true
		value = strings.TrimSpace(value[:len(value)-3])
	}
	if strings.Contains(value, ":") {
		return "", false, serializer.NewError(serializer.CodeParamErr, "illegal container mount options", nil)
	}

	target := filepath.Clean(value)
	if !strings.HasPrefix(target, "/") {
		return "", false, serializer.NewError(serializer.CodeParamErr, "container mount path must be absolute", nil)
	}

	return target, readOnly, nil
}

func isDangerousHostPath(path string) bool {
	if path == "/" {
		return true
	}
	if path == "/var/run/docker.sock" {
		return true
	}

	dangerousPrefixes := []string{
		"/proc",
		"/sys",
		"/dev",
		"/boot",
		"/root",
		"/etc",
		"/bin",
		"/sbin",
		"/lib",
		"/lib64",
	}
	for _, prefix := range dangerousPrefixes {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

func isAllowedHostPath(path string, prefixes []string) bool {
	normalizedPath := normalizeRelativePath(path)

	for _, allowedPrefix := range prefixes {
		prefix := strings.TrimSpace(allowedPrefix)
		if prefix == "" {
			continue
		}
		if strings.HasPrefix(prefix, "/") {
			cleanPrefix := filepath.Clean(prefix)
			if path == cleanPrefix || strings.HasPrefix(path, cleanPrefix+"/") {
				return true
			}
			continue
		}

		normalizedPrefix := normalizeRelativePath(prefix)
		if normalizedPath == normalizedPrefix || strings.HasPrefix(normalizedPath, normalizedPrefix+"/") {
			return true
		}
	}

	return false
}

func normalizeRelativePath(path string) string {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	return strings.TrimPrefix(cleaned, "./")
}

func validateCommand(command []string, policy deployImagePolicy) error {
	if len(command) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(command))
	for _, c := range command {
		part := strings.TrimSpace(c)
		if part == "" {
			continue
		}
		normalized = append(normalized, part)
	}

	if len(normalized) == 0 {
		return nil
	}

	for _, allowed := range policy.AllowedCommands {
		if equalStringSlice(normalized, allowed) {
			return nil
		}
	}

	return serializer.NewError(serializer.CodeParamErr, "command not allowed", nil)
}

func equalStringSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func setOf(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, v := range values {
		result[v] = struct{}{}
	}
	return result
}
