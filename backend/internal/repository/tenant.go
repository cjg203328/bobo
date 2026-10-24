package repository

import (
	"errors"

	"huabu/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var errNilTenantWrite = errors.New("tenant write payload is nil")

// Tenant 按主键读取租户；不存在时返回底层错误，由领域层统一转成拒绝访问。
func (r *Repository) Tenant(id string) (*model.Tenant, error) {
	var value model.Tenant
	if err := r.db.First(&value, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &value, nil
}

func (r *Repository) Membership(tenantID, userID string) (*model.TenantMembership, error) {
	var value model.TenantMembership
	if err := r.db.First(&value, "tenant_id = ? AND user_id = ?", tenantID, userID).Error; err != nil {
		return nil, err
	}
	return &value, nil
}

func (r *Repository) MembershipsByUser(userID string) ([]model.TenantMembership, error) {
	var values []model.TenantMembership
	if err := r.db.Where("user_id = ?", userID).Order("created_at ASC").Find(&values).Error; err != nil {
		return nil, err
	}
	return values, nil
}

func (r *Repository) MembershipsByTenant(tenantID string) ([]model.TenantMembership, error) {
	var values []model.TenantMembership
	if err := r.db.Where("tenant_id = ?", tenantID).Order("created_at ASC").Find(&values).Error; err != nil {
		return nil, err
	}
	return values, nil
}

// CreateTenant 在同一事务内写入租户与首位所有者，避免出现无主租户。
func (r *Repository) CreateTenant(value *model.Tenant, owner *model.TenantMembership) error {
	if value == nil || owner == nil {
		return errNilTenantWrite
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(value).Error; err != nil {
			return err
		}
		owner.TenantID = value.ID
		return tx.Create(owner).Error
	})
}

// PutMembership 以复合主键做 upsert：重复添加同一成员只更新角色，
// 不产生第二条记录。
func (r *Repository) PutMembership(value *model.TenantMembership) error {
	if value == nil {
		return errNilTenantWrite
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"role", "invited_by", "updated_at"}),
	}).Create(value).Error
}

func (r *Repository) DeleteMembership(tenantID, userID string) error {
	return r.db.Where("tenant_id = ? AND user_id = ?", tenantID, userID).Delete(&model.TenantMembership{}).Error
}

func (r *Repository) CountOwners(tenantID string) (int64, error) {
	var count int64
	if err := r.db.Model(&model.TenantMembership{}).
		Where("tenant_id = ? AND role = ?", tenantID, model.TenantRoleOwner).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// CreatePersonalTenant 为个人空间创建租户与所有者成员，ID 由序列生成以保证
// 可读且不与团队租户冲突。
func (r *Repository) CreatePersonalTenant(userID, name string) (*model.Tenant, error) {
	id, err := r.nextPrefixedID(r.db, "tn")
	if err != nil {
		return nil, err
	}
	value := &model.Tenant{
		ID: id, Name: name, Kind: "personal",
		Status: model.TenantStatusActive, OwnerUserID: userID,
	}
	owner := &model.TenantMembership{UserID: userID, Role: model.TenantRoleOwner, InvitedBy: userID}
	if err := r.CreateTenant(value, owner); err != nil {
		return nil, err
	}
	return value, nil
}

// CreateTeamTenant 建立团队租户，创建者即首位所有者。
// 与个人空间共用同一张成员表，避免两套归属规则并存。
func (r *Repository) CreateTeamTenant(userID, name string) (*model.Tenant, error) {
	id, err := r.nextPrefixedID(r.db, "tn")
	if err != nil {
		return nil, err
	}
	value := &model.Tenant{
		ID: id, Name: name, Kind: "team",
		Status: model.TenantStatusActive, OwnerUserID: userID,
	}
	owner := &model.TenantMembership{UserID: userID, Role: model.TenantRoleOwner, InvitedBy: userID}
	if err := r.CreateTenant(value, owner); err != nil {
		return nil, err
	}
	return value, nil
}

// UpdateTenantName 只允许改名，避免通过同一路径改写归属与状态。
func (r *Repository) UpdateTenantName(id, name string) error {
	return r.db.Model(&model.Tenant{}).Where("id = ?", id).Update("name", name).Error
}
