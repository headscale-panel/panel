package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/utils/serializer"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// dnsNameRegexp validates DNS record names (RFC 1123 hostname with optional trailing dot).
var dnsNameRegexp = regexp.MustCompile(`^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\.?$`)

type dnsService struct {
	lastSyncMtime time.Time
	mtimeMu       sync.Mutex
}

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
	serializer.PaginationQuery
	Keyword string `form:"keyword"`
	Type    string `form:"type"`
}

// ExtraRecord represents a Headscale extra-records.json entry
type ExtraRecord struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

// validateDNSRecord checks that name is a valid domain and value is a valid IP for the given type.
func validateDNSRecord(name, recordType, value string) error {
	if !dnsNameRegexp.MatchString(strings.TrimSpace(name)) {
		return serializer.NewError(serializer.CodeParamErr, "invalid DNS record name: must be a valid domain name", nil)
	}
	ip := net.ParseIP(strings.TrimSpace(value))
	if ip == nil {
		return serializer.NewError(serializer.CodeParamErr, "invalid DNS record value: must be a valid IP address", nil)
	}
	switch strings.ToUpper(strings.TrimSpace(recordType)) {
	case "A":
		if ip.To4() == nil {
			return serializer.NewError(serializer.CodeParamErr, "A record value must be an IPv4 address", nil)
		}
	case "AAAA":
		if ip.To4() != nil {
			return serializer.NewError(serializer.CodeParamErr, "AAAA record value must be an IPv6 address", nil)
		}
	}
	return nil
}

func (s *dnsService) Create(actorUserID uint, req *CreateDNSRecordRequest) (*model.DNSRecord, error) {
	if err := RequirePermission(actorUserID, "dns:record:create"); err != nil {
		return nil, err
	}
	if err := validateDNSRecord(req.Name, req.Type, req.Value); err != nil {
		return nil, err
	}
	record := model.DNSRecord{Name: req.Name, Type: req.Type, Value: req.Value, Comment: req.Comment}
	if err := model.DB.Create(&record).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
	}
	if err := s.SyncToFile(actorUserID); err != nil {
		return &record, err
	}
	return &record, nil
}

func (s *dnsService) List(actorUserID uint, req *ListDNSRecordRequest) ([]model.DNSRecord, int64, error) {
	if err := RequirePermission(actorUserID, "dns:record:list"); err != nil {
		return nil, 0, err
	}
	if s.shouldSyncFromFile() {
		if _, err := s.syncFileRecordsToDB(); err != nil {
			return nil, 0, err
		}
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
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}
	offset := (req.Page - 1) * req.PageSize
	if err := query.Offset(offset).Limit(req.PageSize).Order("created_at DESC").Find(&records).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}
	return records, total, nil
}

func (s *dnsService) Update(actorUserID uint, req *UpdateDNSRecordRequest) (*model.DNSRecord, error) {
	if err := RequirePermission(actorUserID, "dns:record:update"); err != nil {
		return nil, err
	}
	var record model.DNSRecord
	if err := model.DB.First(&record, req.ID).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
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
			return nil, serializer.ErrDatabase.WithError(err)
		}
	}
	if err := model.DB.First(&record, req.ID).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
	}
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
		return serializer.ErrDatabase.WithError(err)
	}
	return s.SyncToFile(actorUserID)
}

func (s *dnsService) Get(actorUserID uint, id uint) (*model.DNSRecord, error) {
	if err := RequirePermission(actorUserID, "dns:record:get"); err != nil {
		return nil, err
	}
	var record model.DNSRecord
	if err := model.DB.First(&record, id).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
	}
	return &record, nil
}

// SyncToFile synchronizes all DNS records to the extra-records.json file
func (s *dnsService) SyncToFile(actorUserID uint) error {
	if err := RequirePermission(actorUserID, "dns:sync"); err != nil {
		return err
	}
	var records []model.DNSRecord
	if err := model.DB.Find(&records).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	extraRecords := make([]ExtraRecord, len(records))
	for i, r := range records {
		extraRecords[i] = ExtraRecord{Name: r.Name, Type: r.Type, Value: r.Value}
	}
	if err := os.MkdirAll(filepath.Dir(constants.ExtraRecordsFilePath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}
	data, err := json.MarshalIndent(extraRecords, "", "  ")
	if err != nil {
		return fmt.Errorf("JSON marshal failed: %w", err)
	}
	if err := os.WriteFile(constants.ExtraRecordsFilePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return nil
}

// GetExtraRecordsFromFile reads DNS records from the extra-records file
func (s *dnsService) GetExtraRecordsFromFile(actorUserID uint) ([]ExtraRecord, error) {
	if err := RequirePermission(actorUserID, "dns:file:get"); err != nil {
		return nil, err
	}
	return s.readExtraRecordsFromFile()
}

// ImportFromFile imports DNS records from the file into the database
func (s *dnsService) ImportFromFile(actorUserID uint) (int, error) {
	if err := RequirePermission(actorUserID, "dns:import"); err != nil {
		return 0, err
	}
	return s.syncFileRecordsToDB()
}

// shouldSyncFromFile checks if the extra-records.json file has been modified since last sync
func (s *dnsService) shouldSyncFromFile() bool {
	info, err := os.Stat(constants.ExtraRecordsFilePath)
	if err != nil {
		return false
	}
	s.mtimeMu.Lock()
	defer s.mtimeMu.Unlock()
	return info.ModTime().After(s.lastSyncMtime)
}

func (s *dnsService) markSynced() {
	info, err := os.Stat(constants.ExtraRecordsFilePath)
	if err != nil {
		return
	}
	s.mtimeMu.Lock()
	defer s.mtimeMu.Unlock()
	s.lastSyncMtime = info.ModTime()
}

func (s *dnsService) readExtraRecordsFromFile() ([]ExtraRecord, error) {
	data, err := os.ReadFile(constants.ExtraRecordsFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []ExtraRecord{}, nil
		}
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	var records []ExtraRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("JSON parse failed: %w", err)
	}
	return records, nil
}

func (s *dnsService) syncFileRecordsToDB() (int, error) {
	records, err := s.readExtraRecordsFromFile()
	if err != nil {
		return 0, err
	}
	imported := 0
	for _, rawRecord := range records {
		r := ExtraRecord{
			Name:  strings.TrimSpace(rawRecord.Name),
			Type:  strings.ToUpper(strings.TrimSpace(rawRecord.Type)),
			Value: strings.TrimSpace(rawRecord.Value),
		}
		if r.Name == "" || r.Type == "" || r.Value == "" {
			return imported, fmt.Errorf("extra-records.json contains invalid record: name/type/value must not be empty")
		}
		if r.Type != "A" && r.Type != "AAAA" {
			return imported, fmt.Errorf("extra-records.json contains invalid record type: %s", r.Type)
		}
		var existing model.DNSRecord
		result := model.DB.Where("name = ? AND type = ?", r.Name, r.Type).First(&existing)
		if result.Error == nil {
			if existing.Value != r.Value {
				existing.Value = r.Value
				if err := model.DB.Save(&existing).Error; err != nil {
					return imported, serializer.ErrDatabase.WithError(err)
				}
				imported++
			}
		} else {
			if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
				return imported, serializer.ErrDatabase.WithError(result.Error)
			}
			newRecord := model.DNSRecord{Name: r.Name, Type: r.Type, Value: r.Value}
			if err := model.DB.Create(&newRecord).Error; err != nil {
				return imported, serializer.ErrDatabase.WithError(err)
			}
			imported++
		}
	}
	s.markSynced()
	return imported, nil
}
