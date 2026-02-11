package services

import (
	"encoding/json"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/utils/serializer"
	"os"
	"path/filepath"
)

type dnsService struct{}

var DNSService = new(dnsService)

type CreateDNSRecordRequest struct {
	Name    string `json:"name" binding:"required"`
	Type    string `json:"type" binding:"required,oneof=A AAAA"`
	Value   string `json:"value" binding:"required"`
	Comment string `json:"comment"`
}

type UpdateDNSRecordRequest struct {
	ID      uint   `json:"id" binding:"required"`
	Name    string `json:"name"`
	Type    string `json:"type" binding:"omitempty,oneof=A AAAA"`
	Value   string `json:"value"`
	Comment string `json:"comment"`
}

type ListDNSRecordRequest struct {
	Page     int    `form:"page,default=1"`
	PageSize int    `form:"page_size,default=10"`
	Keyword  string `form:"keyword"`
	Type     string `form:"type"`
}

// ExtraRecord 表示 Headscale extra-records.json 的记录格式
type ExtraRecord struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

func (s *dnsService) Create(actorUserID uint, req *CreateDNSRecordRequest) (*model.DNSRecord, error) {
	if err := RequirePermission(actorUserID, "dns:record:create"); err != nil {
		return nil, err
	}

	record := model.DNSRecord{
		Name:    req.Name,
		Type:    req.Type,
		Value:   req.Value,
		Comment: req.Comment,
	}

	if err := model.DB.Create(&record).Error; err != nil {
		return nil, serializer.ErrDatabase
	}

	// 同步到文件
	if err := s.SyncToFile(actorUserID); err != nil {
		return &record, err
	}

	return &record, nil
}

func (s *dnsService) List(actorUserID uint, req *ListDNSRecordRequest) ([]model.DNSRecord, int64, error) {
	if err := RequirePermission(actorUserID, "dns:record:list"); err != nil {
		return nil, 0, err
	}

	var records []model.DNSRecord
	var total int64

	query := model.DB.Model(&model.DNSRecord{})

	if req.Keyword != "" {
		query = query.Where("name LIKE ? OR value LIKE ? OR comment LIKE ?",
			"%"+req.Keyword+"%", "%"+req.Keyword+"%", "%"+req.Keyword+"%")
	}

	if req.Type != "" {
		query = query.Where("type = ?", req.Type)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	offset := (req.Page - 1) * req.PageSize
	if err := query.Offset(offset).Limit(req.PageSize).Order("created_at DESC").Find(&records).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	return records, total, nil
}

func (s *dnsService) Update(actorUserID uint, req *UpdateDNSRecordRequest) (*model.DNSRecord, error) {
	if err := RequirePermission(actorUserID, "dns:record:update"); err != nil {
		return nil, err
	}

	var record model.DNSRecord
	if err := model.DB.First(&record, req.ID).Error; err != nil {
		return nil, serializer.ErrDatabase
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.Value != "" {
		updates["value"] = req.Value
	}
	if req.Comment != "" {
		updates["comment"] = req.Comment
	}

	if len(updates) > 0 {
		if err := model.DB.Model(&record).Updates(updates).Error; err != nil {
			return nil, serializer.ErrDatabase
		}
	}

	// 重新获取更新后的记录
	model.DB.First(&record, req.ID)

	// 同步到文件
	if err := s.SyncToFile(actorUserID); err != nil {
		return &record, err
	}

	return &record, nil
}

func (s *dnsService) Delete(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "dns:record:delete"); err != nil {
		return err
	}

	if err := model.DB.Delete(&model.DNSRecord{}, id).Error; err != nil {
		return serializer.ErrDatabase
	}

	// 同步到文件
	return s.SyncToFile(actorUserID)
}

func (s *dnsService) Get(actorUserID uint, id uint) (*model.DNSRecord, error) {
	if err := RequirePermission(actorUserID, "dns:record:get"); err != nil {
		return nil, err
	}

	var record model.DNSRecord
	if err := model.DB.First(&record, id).Error; err != nil {
		return nil, serializer.ErrDatabase
	}
	return &record, nil
}

// SyncToFile 将所有 DNS 记录同步到 extra-records.json 文件
func (s *dnsService) SyncToFile(actorUserID uint) error {
	if err := RequirePermission(actorUserID, "dns:sync"); err != nil {
		return err
	}

	var records []model.DNSRecord
	if err := model.DB.Find(&records).Error; err != nil {
		return serializer.ErrDatabase
	}

	extraRecords := make([]ExtraRecord, len(records))
	for i, r := range records {
		extraRecords[i] = ExtraRecord{
			Name:  r.Name,
			Type:  r.Type,
			Value: r.Value,
		}
	}

	filePath := s.getExtraRecordsPath()

	// 确保目录存在
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	// 写入文件
	data, err := json.MarshalIndent(extraRecords, "", "  ")
	if err != nil {
		return fmt.Errorf("JSON 序列化失败: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("写入文件失败: %w", err)
	}

	return nil
}

// GetExtraRecordsFromFile 从文件读取 DNS 记录
func (s *dnsService) GetExtraRecordsFromFile(actorUserID uint) ([]ExtraRecord, error) {
	if err := RequirePermission(actorUserID, "dns:file:get"); err != nil {
		return nil, err
	}

	filePath := s.getExtraRecordsPath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []ExtraRecord{}, nil
		}
		return nil, fmt.Errorf("读取文件失败: %w", err)
	}

	var records []ExtraRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	return records, nil
}

func (s *dnsService) getExtraRecordsPath() string {
	// 优先从配置读取，否则使用默认路径
	if conf.Conf.Headscale.ExtraRecordsPath != "" {
		return conf.Conf.Headscale.ExtraRecordsPath
	}
	return "./headscale/extra-records.json"
}

// ImportFromFile 从文件导入 DNS 记录到数据库
func (s *dnsService) ImportFromFile(actorUserID uint) (int, error) {
	if err := RequirePermission(actorUserID, "dns:import"); err != nil {
		return 0, err
	}

	records, err := s.GetExtraRecordsFromFile(actorUserID)
	if err != nil {
		return 0, err
	}

	imported := 0
	for _, r := range records {
		var existing model.DNSRecord
		result := model.DB.Where("name = ? AND type = ?", r.Name, r.Type).First(&existing)
		if result.Error == nil {
			// 已存在，更新
			existing.Value = r.Value
			model.DB.Save(&existing)
		} else {
			// 不存在，创建
			newRecord := model.DNSRecord{
				Name:  r.Name,
				Type:  r.Type,
				Value: r.Value,
			}
			model.DB.Create(&newRecord)
			imported++
		}
	}

	return imported, nil
}
