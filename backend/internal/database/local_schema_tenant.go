package database

import (
	"fmt"

	"huabu/backend/internal/model"

	"gorm.io/gorm"
)

// migrateTenantMembership 建立远端归属的根表。个人空间也建租户，
// 使项目、素材、会话共用同一套隔离规则，而不是在本地 owner 之外再分叉一套判断。
func migrateTenantMembership(tx *gorm.DB) error {
	if err := tx.AutoMigrate(&model.Tenant{}, &model.TenantMembership{}); err != nil {
		return fmt.Errorf("迁移租户与成员结构: %w", err)
	}
	if err := requireSQLitePrimaryKey(tx, "tenant_memberships", []string{"tenant_id", "user_id"}); err != nil {
		return err
	}
	return backfillPersonalTenant(tx)
}

// backfillPersonalTenant 为已有的本地工作区补建个人租户，
// 让升级后的数据仍有确定的归属根，而不是只对新建库生效。
func backfillPersonalTenant(tx *gorm.DB) error {
	var workspaces []model.Workspace
	if err := tx.Order("created_at ASC").Limit(1).Find(&workspaces).Error; err != nil {
		return fmt.Errorf("读取本地工作区: %w", err)
	}
	if len(workspaces) == 0 {
		return nil
	}
	workspace := workspaces[0]
	var count int64
	if err := tx.Model(&model.TenantMembership{}).
		Where("tenant_id = ? AND user_id = ?", workspace.ID, workspace.ID).
		Count(&count).Error; err != nil {
		return fmt.Errorf("检查个人租户成员: %w", err)
	}
	if count > 0 {
		return nil
	}
	tenant := model.Tenant{
		ID: workspace.ID, Name: workspace.Name, Kind: "personal",
		Status: model.TenantStatusActive, OwnerUserID: workspace.ID,
	}
	if err := tx.Create(&tenant).Error; err != nil {
		return fmt.Errorf("补齐个人租户: %w", err)
	}
	membership := model.TenantMembership{
		TenantID: workspace.ID, UserID: workspace.ID,
		Role: model.TenantRoleOwner, InvitedBy: workspace.ID,
	}
	if err := tx.Create(&membership).Error; err != nil {
		return fmt.Errorf("补齐个人租户所有者: %w", err)
	}
	return nil
}
