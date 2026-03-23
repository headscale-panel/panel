package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"headscale-panel/model"
	"headscale-panel/pkg/conf"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestDNSListSyncsRecordsFromExtraRecordsFile(t *testing.T) {
	previousDB := model.DB
	previousConf := conf.Conf
	t.Cleanup(func() {
		model.DB = previousDB
		conf.Conf = previousConf
	})

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	model.DB = db

	if err := db.AutoMigrate(&model.User{}, &model.Group{}, &model.Permission{}, &model.DNSRecord{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	permission := model.Permission{Name: "List DNS", Code: "dns:record:list", Type: "button"}
	if err := db.Create(&permission).Error; err != nil {
		t.Fatalf("create permission: %v", err)
	}

	group := model.Group{Name: "DNS Testers"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}
	if err := db.Model(&group).Association("Permissions").Append(&permission); err != nil {
		t.Fatalf("attach permission: %v", err)
	}

	user := model.User{
		Username: "dns-tester",
		Password: "test-password",
		GroupID:  group.ID,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	existingRecord := model.DNSRecord{
		Name:  "test.app.cn",
		Type:  "A",
		Value: "10.0.0.10",
	}
	if err := db.Create(&existingRecord).Error; err != nil {
		t.Fatalf("create existing record: %v", err)
	}

	tempDir := t.TempDir()
	conf.Conf.Headscale.ExtraRecordsPath = filepath.Join(tempDir, "extra-records.json")

	fileRecords := []ExtraRecord{
		{Name: "test.app.cn", Type: "A", Value: "127.127.0.1"},
		{Name: "test.app.cn", Type: "AAAA", Value: "::1"},
	}
	data, err := json.Marshal(fileRecords)
	if err != nil {
		t.Fatalf("marshal file records: %v", err)
	}
	if err := os.WriteFile(conf.Conf.Headscale.ExtraRecordsPath, data, 0644); err != nil {
		t.Fatalf("write extra-records.json: %v", err)
	}

	records, total, err := DNSService.List(user.ID, &ListDNSRecordRequest{
		Page:     1,
		PageSize: 50,
	})
	if err != nil {
		t.Fatalf("list dns records: %v", err)
	}

	if total != 2 {
		t.Fatalf("unexpected total: got %d want %d", total, 2)
	}
	if len(records) != 2 {
		t.Fatalf("unexpected record count: got %d want %d", len(records), 2)
	}

	valuesByType := make(map[string]string, len(records))
	for _, record := range records {
		valuesByType[record.Type] = record.Value
	}

	if valuesByType["A"] != "127.127.0.1" {
		t.Fatalf("expected A record to be updated from file, got %q", valuesByType["A"])
	}
	if valuesByType["AAAA"] != "::1" {
		t.Fatalf("expected AAAA record to be imported from file, got %q", valuesByType["AAAA"])
	}

	var dbRecords []model.DNSRecord
	if err := db.Order("type asc").Find(&dbRecords).Error; err != nil {
		t.Fatalf("query db records: %v", err)
	}
	if len(dbRecords) != 2 {
		t.Fatalf("expected synced records in db, got %d", len(dbRecords))
	}
}
