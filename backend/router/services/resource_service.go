package services

import (
	"context"
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
	serializer.PaginationQuery
	Keyword string `form:"keyword"`
}

func (s *resourceService) Create(userID uint, req *CreateResourceRequest) error {
	if err := RequirePermission(userID, "resource:create"); err != nil {
		return err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return serializer.NewError(serializer.CodeParamErr, "resource name is required", nil)
	}
	if len(name) > 64 {
		return serializer.NewError(serializer.CodeParamErr, "resource name exceeds 64 characters", nil)
	}

	ipAddress, err := normalizeIPAddress(req.IPAddress)
	if err != nil {
		return serializer.NewError(serializer.CodeParamErr, "invalid IP address format", err)
	}

	port := strings.TrimSpace(req.Port)
	if err := validatePortSpec(port); err != nil {
		return serializer.NewError(serializer.CodeParamErr, "invalid port format", err)
	}

	description := strings.TrimSpace(req.Description)
	if len(description) > 500 {
		return serializer.NewError(serializer.CodeParamErr, "resource description exceeds 500 characters", nil)
	}

	resource := model.Resource{
		Name:        name,
		IPAddress:   ipAddress,
		Port:        port,
		Description: description,
		CreatorID:   userID,
	}

	if err := model.DB.Create(&resource).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *resourceService) List(userID uint, req *ListResourceRequest) ([]model.Resource, int64, error) {
	if err := RequirePermission(userID, "resource:list"); err != nil {
		return nil, 0, err
	}

	var resources []model.Resource
	var total int64

	query := model.DB.Model(&model.Resource{})
	if req.Keyword != "" {
		kw := strings.TrimSpace(req.Keyword)
		query = query.Where("name LIKE ? OR ip_address LIKE ?", "%"+kw+"%", "%"+kw+"%")
	}

	// Fetch all matching resources for ACL filtering
	var allResources []model.Resource
	if err := query.Order("created_at DESC").Find(&allResources).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	// Apply ACL-based filtering for non-admin users
	filtered, err := FilterResourcesByACL(context.Background(), userID, allResources)
	if err != nil {
		return nil, 0, err
	}

	total = int64(len(filtered))

	if req.PageSize <= 0 {
		return filtered, total, nil
	}

	// Apply pagination on filtered results
	offset := (req.Page - 1) * req.PageSize
	if offset >= int(total) {
		return []model.Resource{}, total, nil
	}
	end := offset + req.PageSize
	if end > int(total) {
		end = int(total)
	}
	resources = filtered[offset:end]

	return resources, total, nil
}

// Get returns a single resource if the actor can access it via ACL.
func (s *resourceService) Get(userID uint, id uint) (*model.Resource, error) {
	if err := RequirePermission(userID, "resource:list"); err != nil {
		return nil, err
	}

	var resource model.Resource
	if err := model.DB.First(&resource, id).Error; err != nil {
		return nil, serializer.NewError(serializer.CodeNotFound, "resource not found", err)
	}

	allowed, err := CanActorAccessIP(context.Background(), userID, resource.IPAddress)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, serializer.ErrPermissionDenied
	}

	return &resource, nil
}

func (s *resourceService) Update(userID uint, req *UpdateResourceRequest) error {
	if err := RequirePermission(userID, "resource:update"); err != nil {
		return err
	}

	var resource model.Resource
	if err := model.DB.First(&resource, req.ID).Error; err != nil {
		return serializer.NewError(serializer.CodeNotFound, "resource not found", err)
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
			return serializer.NewError(serializer.CodeParamErr, "resource name is required", nil)
		}
		if len(name) > 64 {
			return serializer.NewError(serializer.CodeParamErr, "resource name exceeds 64 characters", nil)
		}
		resource.Name = name
	}

	if req.IPAddress != "" {
		ipAddress, err := normalizeIPAddress(req.IPAddress)
		if err != nil {
			return serializer.NewError(serializer.CodeParamErr, "invalid IP address format", err)
		}
		resource.IPAddress = ipAddress
	}

	port := strings.TrimSpace(req.Port)
	if err := validatePortSpec(port); err != nil {
		return serializer.NewError(serializer.CodeParamErr, "invalid port format", err)
	}
	resource.Port = port

	description := strings.TrimSpace(req.Description)
	if len(description) > 500 {
		return serializer.NewError(serializer.CodeParamErr, "resource description exceeds 500 characters", nil)
	}
	resource.Description = description

	if err := model.DB.Save(&resource).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *resourceService) Delete(userID uint, id uint) error {
	if err := RequirePermission(userID, "resource:delete"); err != nil {
		return err
	}

	var resource model.Resource
	if err := model.DB.First(&resource, id).Error; err != nil {
		return serializer.NewError(serializer.CodeNotFound, "resource not found", err)
	}

	allowed, err := canManageResource(userID, &resource)
	if err != nil {
		return err
	}
	if !allowed {
		return serializer.ErrPermissionDenied
	}

	if err := model.DB.Delete(&resource).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

// GetAllAsHosts returns all resources as a map for ACL hosts
func (s *resourceService) GetAllAsHosts() (map[string]string, error) {
	var resources []model.Resource
	if err := model.DB.Find(&resources).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
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
		return false, serializer.NewError(serializer.CodeUserNotFound, "user not found", err)
	}

	if strings.EqualFold(strings.TrimSpace(user.Group.Name), "admin") {
		return true, nil
	}
	return false, nil
}

func normalizeIPAddress(input string) (string, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", serializer.NewError(serializer.CodeParamErr, "IP address is required", nil)
	}

	if strings.Contains(raw, "/") {
		prefix, err := netip.ParsePrefix(raw)
		if err != nil {
			return "", serializer.NewError(serializer.CodeParamErr, "invalid IP/CIDR format", err)
		}
		return prefix.Masked().String(), nil
	}

	ip, err := netip.ParseAddr(raw)
	if err != nil {
		return "", serializer.NewError(serializer.CodeParamErr, "invalid IP format", err)
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
			return serializer.NewError(serializer.CodeParamErr, "invalid port format", nil)
		}

		if strings.Contains(item, "-") {
			rangeParts := strings.Split(item, "-")
			if len(rangeParts) != 2 {
				return serializer.NewError(serializer.CodeParamErr, "invalid port range format", nil)
			}
			start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
			if err != nil || start < 1 || start > 65535 {
				return serializer.NewError(serializer.CodeParamErr, "invalid port range start value", nil)
			}
			end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
			if err != nil || end < 1 || end > 65535 {
				return serializer.NewError(serializer.CodeParamErr, "invalid port range end value", nil)
			}
			if start > end {
				return serializer.NewError(serializer.CodeParamErr, "port range start must not exceed end", nil)
			}
			continue
		}

		p, err := strconv.Atoi(item)
		if err != nil || p < 1 || p > 65535 {
			return serializer.NewError(serializer.CodeParamErr, "invalid port value", nil)
		}
	}

	return nil
}
