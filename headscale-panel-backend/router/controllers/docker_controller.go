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

func (c *DockerController) ensureService(ctx *gin.Context) bool {
	if c.dockerService == nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "Docker service not available", nil))
		return false
	}
	return true
}

// GetContainer gets information about a container
func (c *DockerController) GetContainer(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	containerName := ctx.Param("name")
	userID := ctx.GetUint("userID")

	container, err := c.dockerService.GetContainer(userID, containerName)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, container)
}

// StartContainer starts a container
func (c *DockerController) StartContainer(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	containerName := ctx.Param("name")
	userID := ctx.GetUint("userID")

	if err := c.dockerService.StartContainer(userID, containerName); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "Container started successfully"})
}

// StopContainer stops a container
func (c *DockerController) StopContainer(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	containerName := ctx.Param("name")
	userID := ctx.GetUint("userID")

	if err := c.dockerService.StopContainer(userID, containerName); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "Container stopped successfully"})
}

// RestartContainer restarts a container
func (c *DockerController) RestartContainer(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	containerName := ctx.Param("name")
	userID := ctx.GetUint("userID")

	if err := c.dockerService.RestartContainer(userID, containerName); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "Container restarted successfully"})
}

// GetContainerLogs gets logs from a container
func (c *DockerController) GetContainerLogs(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	containerName := ctx.Param("name")
	tailStr := ctx.DefaultQuery("tail", "100")
	userID := ctx.GetUint("userID")

	tail, err := strconv.Atoi(tailStr)
	if err != nil {
		tail = 100
	}

	logs, err := c.dockerService.GetContainerLogs(userID, containerName, tail)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"logs": logs})
}

// GetContainerStats gets resource usage statistics for a container
func (c *DockerController) GetContainerStats(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	containerName := ctx.Param("name")
	userID := ctx.GetUint("userID")

	stats, err := c.dockerService.GetContainerStats(userID, containerName)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, stats)
}

// ListContainers lists all containers
func (c *DockerController) ListContainers(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	userID := ctx.GetUint("userID")
	containers, err := c.dockerService.ListContainers(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, containers)
}

// DeployContainer creates and starts a new container
func (c *DockerController) DeployContainer(ctx *gin.Context) {
	if !c.ensureService(ctx) {
		return
	}

	var req services.DeployRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	progress, err := c.dockerService.DeployContainer(userID, req)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"progress": progress,
	})
}
