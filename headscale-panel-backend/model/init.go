package model

import (
	"headscale-panel/pkg/conf"
	"log"

	"github.com/glebarez/sqlite"
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
	)
	if err != nil {
		log.Fatalf("models.AutoMigrate err: %v", err)
	}

	initDefaultData()
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

		{Name: "查看资源", Code: "resource:list", Type: "button"},
		{Name: "发布资源", Code: "resource:create", Type: "button"},
		{Name: "编辑资源", Code: "resource:update", Type: "button"},
		{Name: "删除资源", Code: "resource:delete", Type: "button"},
	}

	for _, p := range permissions {
		DB.FirstOrCreate(&p, Permission{Code: p.Code})
	}

	// 管理员组
	var adminGroup Group
	if err := DB.Where("name = ?", "Admin").First(&adminGroup).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			adminGroup = Group{Name: "Admin"}
			DB.Create(&adminGroup)
		}
	}

	// 给管理员组分配所有权限
	var allPermissions []Permission
	DB.Find(&allPermissions)
	DB.Model(&adminGroup).Association("Permissions").Replace(allPermissions)

	// 普通用户组
	var userGroup Group
	if err := DB.Where("name = ?", "User").First(&userGroup).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			userGroup = Group{Name: "User"}
			DB.Create(&userGroup)
		}
	}

	// 给普通用户组分配基本权限
	var basicPermissions []Permission
	DB.Where("code IN ?", []string{"dashboard:view", "resource:list", "resource:create"}).Find(&basicPermissions)
	DB.Model(&userGroup).Association("Permissions").Replace(basicPermissions)

	// 默认管理员账户
	var adminUser User
	if err := DB.Where("username = ?", "admin").First(&adminUser).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			adminUser = User{
				Username: "admin",
				Password: "admin123", // 默认密码，首次登录后请修改
				Email:    "",
				GroupID:  adminGroup.ID,
			}
			DB.Create(&adminUser)
			log.Println("Created default admin user: admin / admin123")
		}
	}
}
