package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"net/netip"
	"strconv"
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
	if err := RequirePermission(userID, "resource:create"); err != nil {
		return err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return serializer.NewError(serializer.CodeParamErr, "资源名称不能为空", nil)
	}
	if len(name) > 64 {
		return serializer.NewError(serializer.CodeParamErr, "资源名称长度不能超过64", nil)
	}

	ipAddress, err := normalizeIPAddress(req.IPAddress)
	if err != nil {
		return serializer.NewError(serializer.CodeParamErr, err.Error(), nil)
	}

	port := strings.TrimSpace(req.Port)
	if err := validatePortSpec(port); err != nil {
		return serializer.NewError(serializer.CodeParamErr, err.Error(), nil)
	}

	description := strings.TrimSpace(req.Description)
	if len(description) > 500 {
		return serializer.NewError(serializer.CodeParamErr, "资源描述长度不能超过500", nil)
	}

	resource := model.Resource{
		Name:        name,
		IPAddress:   ipAddress,
		Port:        port,
		Description: description,
		CreatorID:   userID,
	}

	if err := model.DB.Create(&resource).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

func (s *resourceService) List(userID uint, req *ListResourceRequest) ([]model.Resource, int64, error) {
	if err := RequirePermission(userID, "resource:list"); err != nil {
		return nil, 0, err
	}

	if req.Page <= 0 {
		req.Page = 1
	}
	if req.PageSize <= 0 {
		req.PageSize = 10
	}
	if req.PageSize > 200 {
		req.PageSize = 200
	}

	var resources []model.Resource
	var total int64

	query := model.DB.Model(&model.Resource{})
	if req.Keyword != "" {
		kw := strings.TrimSpace(req.Keyword)
		query = query.Where("name LIKE ? OR ip_address LIKE ?", "%"+kw+"%", "%"+kw+"%")
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
	if err := RequirePermission(userID, "resource:update"); err != nil {
		return err
	}

	var resource model.Resource
	if err := model.DB.First(&resource, req.ID).Error; err != nil {
		return serializer.NewError(serializer.CodeNotFound, "资源不存在", err)
	}

	allowed, err := canManageResource(userID, &resource)
	if err != nil {
		return err
	}
	if !allowed {
		return serializer.ErrPermissionDenied
	}

	if req.Name != "" {
		name := strings.TrimSpace(req.Name)
		if name == "" {
			return serializer.NewError(serializer.CodeParamErr, "资源名称不能为空", nil)
		}
		if len(name) > 64 {
			return serializer.NewError(serializer.CodeParamErr, "资源名称长度不能超过64", nil)
		}
		resource.Name = name
	}

	if req.IPAddress != "" {
		ipAddress, err := normalizeIPAddress(req.IPAddress)
		if err != nil {
			return serializer.NewError(serializer.CodeParamErr, err.Error(), nil)
		}
		resource.IPAddress = ipAddress
	}

	port := strings.TrimSpace(req.Port)
	if err := validatePortSpec(port); err != nil {
		return serializer.NewError(serializer.CodeParamErr, err.Error(), nil)
	}
	resource.Port = port

	description := strings.TrimSpace(req.Description)
	if len(description) > 500 {
		return serializer.NewError(serializer.CodeParamErr, "资源描述长度不能超过500", nil)
	}
	resource.Description = description

	if err := model.DB.Save(&resource).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

func (s *resourceService) Delete(userID uint, id uint) error {
	if err := RequirePermission(userID, "resource:delete"); err != nil {
		return err
	}

	var resource model.Resource
	if err := model.DB.First(&resource, id).Error; err != nil {
		return serializer.NewError(serializer.CodeNotFound, "资源不存在", err)
	}

	allowed, err := canManageResource(userID, &resource)
	if err != nil {
		return err
	}
	if !allowed {
		return serializer.ErrPermissionDenied
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

func canManageResource(userID uint, resource *model.Resource) (bool, error) {
	if resource.CreatorID == userID {
		return true, nil
	}

	var user model.User
	if err := model.DB.Preload("Group").First(&user, userID).Error; err != nil {
		return false, serializer.NewError(serializer.CodeUserNotFound, "用户不存在", err)
	}

	if strings.EqualFold(strings.TrimSpace(user.Group.Name), "admin") {
		return true, nil
	}
	return false, nil
}

func normalizeIPAddress(input string) (string, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", serializer.NewError(serializer.CodeParamErr, "IP地址不能为空", nil)
	}

	if strings.Contains(raw, "/") {
		prefix, err := netip.ParsePrefix(raw)
		if err != nil {
			return "", serializer.NewError(serializer.CodeParamErr, "IP/CIDR格式不正确", err)
		}
		return prefix.Masked().String(), nil
	}

	ip, err := netip.ParseAddr(raw)
	if err != nil {
		return "", serializer.NewError(serializer.CodeParamErr, "IP格式不正确", err)
	}

	bits := 32
	if ip.Is6() {
		bits = 128
	}
	return netip.PrefixFrom(ip, bits).String(), nil
}

func validatePortSpec(portSpec string) error {
	if portSpec == "" {
		return nil
	}

	parts := strings.Split(portSpec, ",")
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			return serializer.NewError(serializer.CodeParamErr, "端口格式不正确", nil)
		}

		if strings.Contains(item, "-") {
			rangeParts := strings.Split(item, "-")
			if len(rangeParts) != 2 {
				return serializer.NewError(serializer.CodeParamErr, "端口范围格式不正确", nil)
			}
			start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
			if err != nil || start < 1 || start > 65535 {
				return serializer.NewError(serializer.CodeParamErr, "端口范围起始值不合法", nil)
			}
			end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
			if err != nil || end < 1 || end > 65535 {
				return serializer.NewError(serializer.CodeParamErr, "端口范围结束值不合法", nil)
			}
			if start > end {
				return serializer.NewError(serializer.CodeParamErr, "端口范围起始值不能大于结束值", nil)
			}
			continue
		}

		p, err := strconv.Atoi(item)
		if err != nil || p < 1 || p > 65535 {
			return serializer.NewError(serializer.CodeParamErr, "端口值不合法", nil)
		}
	}

	return nil
}
