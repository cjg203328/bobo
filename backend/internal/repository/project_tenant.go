package repository

import (
	"errors"

	"huabu/backend/internal/model"
)

// ErrProjectTenantMissing 表示项目没有租户归属。v18 之后历史行已被回填，
// 出现该错误说明写入路径绕过了租户绑定，不能降级成“按用户 ID 猜”。
var ErrProjectTenantMissing = errors.New("project has no tenant ownership")

// ProjectsInTenant 按租户返回项目列表。租户是可见性边界，user_id 只是创建者，
// 因此这里不再附加 user_id 条件。
func (r *Repository) ProjectsInTenant(tenantID string) ([]model.Project, error) {
	if tenantID == "" {
		return nil, ErrProjectTenantMissing
	}
	var projects []model.Project
	err := r.db.Where("tenant_id = ?", tenantID).Order("updated_at desc").Find(&projects).Error
	return projects, err
}

// ProjectsInTenantPage 提供与 ProjectsPage 一致的分页语义，但过滤维度是租户。
func (r *Repository) ProjectsInTenantPage(tenantID string, page int, pageSize int) ([]model.Project, int64, error) {
	if tenantID == "" {
		return nil, 0, ErrProjectTenantMissing
	}
	var projects []model.Project
	var total int64
	query := r.db.Model(&model.Project{}).Where("tenant_id = ?", tenantID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("updated_at desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&projects).Error; err != nil {
		return nil, 0, err
	}
	return projects, total, nil
}

// ProjectInTenant 按租户读取单个项目。跨租户访问返回 gorm.ErrRecordNotFound，
// 与“项目不存在”保持同一对外表现，避免通过错误码探测他人项目是否存在。
func (r *Repository) ProjectInTenant(tenantID, id string) (*model.Project, error) {
	if tenantID == "" {
		return nil, ErrProjectTenantMissing
	}
	var project model.Project
	if err := r.db.First(&project, "id = ? AND tenant_id = ?", id, tenantID).Error; err != nil {
		return nil, err
	}
	return &project, nil
}

// BackfillProjectTenant 为单条项目补租户归属，仅在确认其归属后调用。
// 已有非空归属时不做覆盖，防止误把项目迁到别的租户。
func (r *Repository) BackfillProjectTenant(projectID, tenantID string) error {
	if projectID == "" || tenantID == "" {
		return ErrProjectTenantMissing
	}
	return r.db.Model(&model.Project{}).
		Where("id = ? AND (tenant_id IS NULL OR tenant_id = ?)", projectID, "").
		Update("tenant_id", tenantID).Error
}

// ProjectTenantOf 读取项目的租户归属，供写路径在提交前做同租户断言。
func (r *Repository) ProjectTenantOf(projectID string) (string, error) {
	var project model.Project
	if err := r.db.Select("id", "tenant_id").First(&project, "id = ?", projectID).Error; err != nil {
		return "", err
	}
	if project.TenantID == "" {
		return "", ErrProjectTenantMissing
	}
	return project.TenantID, nil
}

// projectsWithoutTenant 用于运维与迁移自检：统计仍缺租户归属的项目行数。
func (r *Repository) projectsWithoutTenant() (int64, error) {
	var count int64
	if err := r.db.Model(&model.Project{}).
		Where("tenant_id IS NULL OR tenant_id = ?", "").
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// PrimaryTenantForUser 返回用户的归属租户：最早加入且仍可用的空间。
// 桌面端单工作区场景下即个人空间；没有成员关系时返回明确错误，
// 由调用方决定是否中断，而不是静默写入空归属。
func (r *Repository) PrimaryTenantForUser(userID string) (string, error) {
	if userID == "" {
		return "", ErrProjectTenantMissing
	}
	var memberships []model.TenantMembership
	if err := r.db.Where("user_id = ?", userID).Order("created_at ASC").Find(&memberships).Error; err != nil {
		return "", err
	}
	for _, membership := range memberships {
		var value model.Tenant
		if err := r.db.First(&value, "id = ? AND status = ?", membership.TenantID, model.TenantStatusActive).Error; err != nil {
			continue
		}
		return value.ID, nil
	}
	return "", ErrProjectTenantMissing
}
