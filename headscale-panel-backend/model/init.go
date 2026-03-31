package model

import (
	"errors"
	"fmt"
	"headscale-panel/pkg/conf"
	"log"
	"strings"

	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init() {
	var err error
	DB, err = gorm.Open(sqlite.Open(conf.Conf.DB.Path), &gorm.Config{})
	if err != nil {
		log.Fatalf("models.Setup err: %v", err)
	}

	// 自动迁移
	err = DB.AutoMigrate(
		&User{},
		&Group{},
		&Resource{},
		&Permission{},
		&OauthClient{},
		&ACLPolicy{},
		&DNSRecord{},
		&SetupState{},
		&PanelSetting{},
	)
	if err != nil {
		log.Fatalf("models.AutoMigrate err: %v", err)
	}

	if err := migrateLegacyOauthClientSecrets(); err != nil {
		log.Fatalf("failed to migrate oauth client secrets: %v", err)
	}

	initDefaultData()
}

func Close() error {
	if DB == nil {
		return nil
	}
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql db: %w", err)
	}
	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("failed to close sql db: %w", err)
	}
	return nil
}

func initDefaultData() {
	// 默认权限
	permissions := []Permission{
		{Name: "查看仪表盘", Code: "dashboard:view", Type: "menu"},

		{Name: "查看用户", Code: "system:user:list", Type: "button"},
		{Name: "创建用户", Code: "system:user:create", Type: "button"},
		{Name: "编辑用户", Code: "system:user:update", Type: "button"},
		{Name: "删除用户", Code: "system:user:delete", Type: "button"},

		{Name: "查看用户组", Code: "system:group:list", Type: "button"},
		{Name: "创建用户组", Code: "system:group:create", Type: "button"},
		{Name: "编辑用户组", Code: "system:group:update", Type: "button"},
		{Name: "删除用户组", Code: "system:group:delete", Type: "button"},
		{Name: "查看权限", Code: "system:permission:list", Type: "button"},
		{Name: "创建权限", Code: "system:permission:create", Type: "button"},
		{Name: "编辑权限", Code: "system:permission:update", Type: "button"},
		{Name: "删除权限", Code: "system:permission:delete", Type: "button"},
		{Name: "查看 OAuth 客户端", Code: "system:oauth_client:list", Type: "button"},
		{Name: "创建 OAuth 客户端", Code: "system:oauth_client:create", Type: "button"},
		{Name: "编辑 OAuth 客户端", Code: "system:oauth_client:update", Type: "button"},
		{Name: "删除 OAuth 客户端", Code: "system:oauth_client:delete", Type: "button"},
		{Name: "重置 OAuth Secret", Code: "system:oauth_client:secret", Type: "button"},

		{Name: "查看资源", Code: "resource:list", Type: "button"},
		{Name: "发布资源", Code: "resource:create", Type: "button"},
		{Name: "编辑资源", Code: "resource:update", Type: "button"},
		{Name: "删除资源", Code: "resource:delete", Type: "button"},

		{Name: "查看 Headscale 用户", Code: "headscale:user:list", Type: "button"},
		{Name: "创建 Headscale 用户", Code: "headscale:user:create", Type: "button"},
		{Name: "编辑 Headscale 用户", Code: "headscale:user:update", Type: "button"},
		{Name: "删除 Headscale 用户", Code: "headscale:user:delete", Type: "button"},
		{Name: "查看 Headscale 设备", Code: "headscale:machine:list", Type: "button"},
		{Name: "查看设备详情", Code: "headscale:machine:get", Type: "button"},
		{Name: "注册设备", Code: "headscale:machine:create", Type: "button"},
		{Name: "编辑设备名称", Code: "headscale:machine:update", Type: "button"},
		{Name: "删除设备", Code: "headscale:machine:delete", Type: "button"},
		{Name: "过期设备", Code: "headscale:machine:expire", Type: "button"},
		{Name: "设置设备标签", Code: "headscale:machine:tags", Type: "button"},
		{Name: "查看路由", Code: "headscale:route:list", Type: "button"},
		{Name: "启用路由", Code: "headscale:route:enable", Type: "button"},
		{Name: "禁用路由", Code: "headscale:route:disable", Type: "button"},
		{Name: "查看 PreAuthKey", Code: "headscale:preauthkey:list", Type: "button"},
		{Name: "创建 PreAuthKey", Code: "headscale:preauthkey:create", Type: "button"},
		{Name: "过期 PreAuthKey", Code: "headscale:preauthkey:expire", Type: "button"},

		{Name: "查看 ACL", Code: "headscale:acl:view", Type: "button"},
		{Name: "编辑 ACL", Code: "headscale:acl:update", Type: "button"},
		{Name: "同步 ACL 资源", Code: "headscale:acl:sync", Type: "button"},
		{Name: "生成 ACL 策略", Code: "headscale:acl:generate", Type: "button"},
		{Name: "查看 ACL 历史", Code: "headscale:acl:history:list", Type: "button"},
		{Name: "应用 ACL 策略", Code: "headscale:acl:apply", Type: "button"},
		{Name: "查看 ACL 可访问设备", Code: "headscale:acl:access", Type: "button"},

		{Name: "查看 DNS 记录", Code: "dns:record:list", Type: "button"},
		{Name: "查看 DNS 记录详情", Code: "dns:record:get", Type: "button"},
		{Name: "创建 DNS 记录", Code: "dns:record:create", Type: "button"},
		{Name: "更新 DNS 记录", Code: "dns:record:update", Type: "button"},
		{Name: "删除 DNS 记录", Code: "dns:record:delete", Type: "button"},
		{Name: "同步 DNS 文件", Code: "dns:sync", Type: "button"},
		{Name: "导入 DNS 文件", Code: "dns:import", Type: "button"},
		{Name: "查看 DNS 文件", Code: "dns:file:get", Type: "button"},

		{Name: "查看 Headscale 配置", Code: "headscale:config:view", Type: "button"},
		{Name: "更新 Headscale 配置", Code: "headscale:config:update", Type: "button"},
		{Name: "查看 DERP 配置", Code: "headscale:derp:view", Type: "button"},
		{Name: "更新 DERP 配置", Code: "headscale:derp:update", Type: "button"},
		{Name: "查看在线时长", Code: "metrics:online_duration:view", Type: "button"},
		{Name: "查看在线时长统计", Code: "metrics:online_duration_stats:view", Type: "button"},
		{Name: "查看设备状态", Code: "metrics:device_status:view", Type: "button"},
		{Name: "查看设备状态历史", Code: "metrics:device_status_history:view", Type: "button"},
		{Name: "查看流量统计", Code: "metrics:traffic:view", Type: "button"},
		{Name: "查看 InfluxDB 状态", Code: "metrics:influxdb:view", Type: "button"},

		{Name: "查看拓扑", Code: "topology:view", Type: "button"},
		{Name: "查看拓扑 ACL", Code: "topology:with_acl:view", Type: "button"},
		{Name: "查看拓扑 ACL 矩阵", Code: "topology:acl_matrix:view", Type: "button"},
	}

	for _, p := range permissions {
		perm := p
		if err := DB.Where(Permission{Code: perm.Code}).FirstOrCreate(&perm).Error; err != nil {
			log.Fatalf("failed to bootstrap permission %s: %v", perm.Code, err)
		}
	}

	// 管理员组
	var adminGroup Group
	if err := DB.Where("name = ?", "Admin").First(&adminGroup).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			adminGroup = Group{Name: "Admin"}
			if err := DB.Create(&adminGroup).Error; err != nil {
				log.Fatalf("failed to bootstrap Admin group: %v", err)
			}
		} else {
			log.Fatalf("failed to load Admin group: %v", err)
		}
	}

	// 普通用户组
	var userGroup Group
	if err := DB.Where("name = ?", "User").First(&userGroup).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			userGroup = Group{Name: "User"}
			if err := DB.Create(&userGroup).Error; err != nil {
				log.Fatalf("failed to bootstrap User group: %v", err)
			}
		} else {
			log.Fatalf("failed to load User group: %v", err)
		}
	}

	// 给管理员组分配所有权限
	var allPermissions []Permission
	if err := DB.Find(&allPermissions).Error; err != nil {
		log.Fatalf("failed to load permissions for Admin group: %v", err)
	}
	if err := DB.Model(&adminGroup).Association("Permissions").Replace(allPermissions); err != nil {
		log.Fatalf("failed to assign Admin group permissions: %v", err)
	}

	// 禁止保留默认管理员弱口令路径：admin/admin123
	var adminUser User
	err := DB.Where("username = ?", "admin").First(&adminUser).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Fatalf("failed to check admin user: %v", err)
	}

	var userCount int64
	if err := DB.Model(&User{}).Count(&userCount).Error; err == nil && userCount == 0 {
		log.Println("No users found. Create the first admin via /api/v1/setup/init")
	}

	initSetupStateRecord()
}

func initSetupStateRecord() {
	var state SetupState
	err := DB.First(&state, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		state = SetupState{
			ID:    1,
			State: SetupStateUninitialized,
		}
		if err := DB.Create(&state).Error; err != nil {
			log.Fatalf("failed to initialize setup state: %v", err)
		}
		return
	}
	if err != nil {
		log.Fatalf("failed to load setup state: %v", err)
	}
}

func migrateLegacyOauthClientSecrets() error {
	var clients []OauthClient
	if err := DB.
		Where("(client_secret_hash IS NULL OR client_secret_hash = '') AND client_secret IS NOT NULL AND client_secret <> ''").
		Find(&clients).Error; err != nil {
		return fmt.Errorf("query legacy oauth clients failed: %w", err)
	}

	for _, client := range clients {
		legacySecret := strings.TrimSpace(client.ClientSecret)
		if legacySecret == "" {
			continue
		}

		normalizedSecret := strings.ToLower(legacySecret)
		if normalizedSecret == "headscale-secret" {
			return fmt.Errorf("oidc client %q uses insecure default secret; rotate before startup", client.ClientID)
		}

		hashedSecret, err := bcrypt.GenerateFromPassword([]byte(legacySecret), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash oauth secret for client %q failed: %w", client.ClientID, err)
		}

		if err := DB.Model(&OauthClient{}).
			Where("id = ?", client.ID).
			Updates(map[string]interface{}{
				"client_secret_hash": string(hashedSecret),
				"client_secret":      "",
			}).Error; err != nil {
			return fmt.Errorf("persist oauth secret hash for client %q failed: %w", client.ClientID, err)
		}
	}

	return nil
}
