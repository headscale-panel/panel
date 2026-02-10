package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"strings"
)

type resourceService struct{}

var ResourceService = new(resourceService)

type CreateResourceRequest struct {
	Name        string `json:"name" binding:"required"`
	IPAddress   string `json:"ip_address" binding:"required"`
	Port        string `json:"port"`
	Description string `json:"description"`
}

type UpdateResourceRequest struct {
	ID          uint   `json:"id" binding:"required"`
	Name        string `json:"name"`
	IPAddress   string `json:"ip_address"`
	Port        string `json:"port"`
	Description string `json:"description"`
}

type ListResourceRequest struct {
	Page     int    `form:"page,default=1"`
	PageSize int    `form:"page_size,default=10"`
	Keyword  string `form:"keyword"`
}

func (s *resourceService) Create(userID uint, req *CreateResourceRequest) error {
	// Normalize IP address - add /32 if no CIDR suffix
	ipAddress := req.IPAddress
	if !strings.Contains(ipAddress, "/") {
		ipAddress = ipAddress + "/32"
	}

	resource := model.Resource{
		Name:        req.Name,
		IPAddress:   ipAddress,
		Port:        req.Port,
		Description: req.Description,
		CreatorID:   userID,
	}

	if err := model.DB.Create(&resource).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

func (s *resourceService) List(req *ListResourceRequest) ([]model.Resource, int64, error) {
	var resources []model.Resource
	var total int64

	query := model.DB.Model(&model.Resource{})
	if req.Keyword != "" {
		query = query.Where("name LIKE ? OR ip_address LIKE ?", "%"+req.Keyword+"%", "%"+req.Keyword+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	offset := (req.Page - 1) * req.PageSize
	if err := query.Offset(offset).Limit(req.PageSize).Order("created_at DESC").Find(&resources).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	return resources, total, nil
}

func (s *resourceService) Update(userID uint, req *UpdateResourceRequest) error {
	var resource model.Resource
	if err := model.DB.First(&resource, req.ID).Error; err != nil {
		return serializer.ErrDatabase
	}

	// Check permission: only creator or admin can update
	if resource.CreatorID != userID {
		var user model.User
		model.DB.First(&user, userID)
		if user.GroupID != 1 {
			return serializer.ErrPermissionDenied
		}
	}

	// Normalize IP address
	ipAddress := req.IPAddress
	if ipAddress != "" && !strings.Contains(ipAddress, "/") {
		ipAddress = ipAddress + "/32"
	}

	if req.Name != "" {
		resource.Name = req.Name
	}
	if ipAddress != "" {
		resource.IPAddress = ipAddress
	}
	resource.Port = req.Port
	resource.Description = req.Description

	if err := model.DB.Save(&resource).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

func (s *resourceService) Delete(userID uint, id uint) error {
	var resource model.Resource
	if err := model.DB.First(&resource, id).Error; err != nil {
		return serializer.ErrDatabase
	}

	if resource.CreatorID != userID {
		var user model.User
		model.DB.First(&user, userID)
		if user.GroupID != 1 {
			return serializer.ErrPermissionDenied
		}
	}

	if err := model.DB.Delete(&resource).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

// GetAllAsHosts returns all resources as a map for ACL hosts
func (s *resourceService) GetAllAsHosts() (map[string]string, error) {
	var resources []model.Resource
	if err := model.DB.Find(&resources).Error; err != nil {
		return nil, serializer.ErrDatabase
	}

	hosts := make(map[string]string)
	for _, r := range resources {
		hosts[r.Name] = r.IPAddress
	}
	return hosts, nil
}
