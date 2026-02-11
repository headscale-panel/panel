package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	return RequirePermission(actorUserID, permission)
}

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
		// Parse protocol from hostPort if present (e.g. "33478/udp")
		proto := "tcp"
		cleanHostPort := hostPort
		if parts := strings.SplitN(hostPort, "/", 2); len(parts) == 2 {
			cleanHostPort = parts[0]
			proto = parts[1]
		}
		cPort := nat.Port(containerPort + "/" + proto)
		exposedPorts[cPort] = struct{}{}
		portBindings[cPort] = []nat.PortBinding{{HostPort: cleanHostPort}}
	}

	mounts := make([]mount.Mount, 0, len(req.Volumes))
	for hostPath, containerPath := range req.Volumes {
		mounts = append(mounts, mount.Mount{
			Type:     mount.TypeBind,
			Source:   hostPath,
			Target:   containerPath,
			ReadOnly: strings.HasSuffix(containerPath, ":ro"),
		})
	}

	// Determine restart policy
	restartPolicy := container.RestartPolicy{Name: container.RestartPolicyUnlessStopped}
	if req.RestartPolicy == "always" {
		restartPolicy.Name = container.RestartPolicyAlways
	} else if req.RestartPolicy == "no" || req.RestartPolicy == "" {
		restartPolicy.Name = container.RestartPolicyUnlessStopped
	}

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
