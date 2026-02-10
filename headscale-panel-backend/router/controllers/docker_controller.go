package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DockerController struct {
	dockerService *services.DockerService
}

func NewDockerController(dockerService *services.DockerService) *DockerController {
	return &DockerController{dockerService: dockerService}
}

// GetContainer gets information about a container
func (c *DockerController) GetContainer(ctx *gin.Context) {
	containerName := ctx.Param("name")

	container, err := c.dockerService.GetContainer(containerName)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, container)
}

// StartContainer starts a container
func (c *DockerController) StartContainer(ctx *gin.Context) {
	containerName := ctx.Param("name")

	if err := c.dockerService.StartContainer(containerName); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "Container started successfully"})
}

// StopContainer stops a container
func (c *DockerController) StopContainer(ctx *gin.Context) {
	containerName := ctx.Param("name")

	if err := c.dockerService.StopContainer(containerName); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "Container stopped successfully"})
}

// RestartContainer restarts a container
func (c *DockerController) RestartContainer(ctx *gin.Context) {
	containerName := ctx.Param("name")

	if err := c.dockerService.RestartContainer(containerName); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "Container restarted successfully"})
}

// GetContainerLogs gets logs from a container
func (c *DockerController) GetContainerLogs(ctx *gin.Context) {
	containerName := ctx.Param("name")
	tailStr := ctx.DefaultQuery("tail", "100")

	tail, err := strconv.Atoi(tailStr)
	if err != nil {
		tail = 100
	}

	logs, err := c.dockerService.GetContainerLogs(containerName, tail)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"logs": logs})
}

// GetContainerStats gets resource usage statistics for a container
func (c *DockerController) GetContainerStats(ctx *gin.Context) {
	containerName := ctx.Param("name")

	stats, err := c.dockerService.GetContainerStats(containerName)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, stats)
}

// ListContainers lists all containers
func (c *DockerController) ListContainers(ctx *gin.Context) {
	containers, err := c.dockerService.ListContainers()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, containers)
}

// DeployContainer creates and starts a new container
func (c *DockerController) DeployContainer(ctx *gin.Context) {
	var req services.DeployRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if c.dockerService == nil {
		serializer.Fail(ctx, serializer.NewError(500, "Docker service not available", nil))
		return
	}

	progress, err := c.dockerService.DeployContainer(req)
	if err != nil {
		serializer.Fail(ctx, serializer.NewError(500, err.Error(), nil))
		return
	}

	serializer.Success(ctx, gin.H{
		"progress": progress,
	})
}
