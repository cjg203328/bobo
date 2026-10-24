package tenant

import (
	"strings"

	"huabu/backend/internal/kernel"
	"huabu/backend/internal/model"
)

// Repository 是租户与成员关系的持久化端口。领域层不依赖 GORM，
// 以便同一套隔离规则既可用于远端服务，也可用于本地测试替身。
type Repository interface {
	Tenant(id string) (*model.Tenant, error)
	Membership(tenantID, userID string) (*model.TenantMembership, error)
	MembershipsByUser(userID string) ([]model.TenantMembership, error)
	MembershipsByTenant(tenantID string) ([]model.TenantMembership, error)
	CreateTenant(value *model.Tenant, owner *model.TenantMembership) error
	PutMembership(value *model.TenantMembership) error
	DeleteMembership(tenantID, userID string) error
	CountOwners(tenantID string) (int64, error)
}

// Service 拥有租户成员与角色的判定规则。所有写路径必须先经过 Authorize，
// 不允许 handler 或 repository 自行复制角色比较。
type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Scope 是授权通过后的稳定上下文：后续业务只使用 Scope 内的租户与角色，
// 不再从请求参数重新解析归属。
type Scope struct {
	TenantID string
	UserID   string
	Role     model.TenantRole
	Perms    model.TenantPermissions
}

// Authorize 校验用户是目标租户的有效成员且租户可用，返回授权作用域。
func (s *Service) Authorize(tenantID, userID string) (Scope, error) {
	tenantID = strings.TrimSpace(tenantID)
	userID = strings.TrimSpace(userID)
	if tenantID == "" || userID == "" {
		return Scope{}, kernel.Unauthorized("缺少租户或用户身份")
	}
	if s == nil || s.repo == nil {
		return Scope{}, kernel.Unauthorized("租户服务未初始化")
	}
	value, err := s.repo.Tenant(tenantID)
	if err != nil {
		// 身份已经认证，这里失败的原因只可能是“这个租户不可见”。用 401 会让客户端
		// 误判成会话过期并清掉登录态，所以统一按越权处理。
		return Scope{}, kernel.Forbidden("租户不存在或无权访问")
	}
	if value.Status != model.TenantStatusActive {
		return Scope{}, kernel.Forbidden("租户已停用")
	}
	membership, err := s.repo.Membership(tenantID, userID)
	if err != nil {
		return Scope{}, kernel.Forbidden("不是该租户的成员")
	}
	if !model.ValidTenantRole(membership.Role) {
		return Scope{}, kernel.Forbidden("租户角色无效")
	}
	return Scope{
		TenantID: tenantID,
		UserID:   userID,
		Role:     membership.Role,
		Perms:    model.PermissionsFor(membership.Role),
	}, nil
}

// RequireWrite 在 Authorize 结果上再校验具体写能力。
func (s Scope) RequireWrite(check func(model.TenantPermissions) bool, message string) error {
	if check == nil || !check(s.Perms) {
		return kernel.Forbidden(message)
	}
	return nil
}

// AssertSameTenant 校验业务对象归属与授权租户一致，是跨租户访问的唯一拦截点。
func (s Scope) AssertSameTenant(objectTenantID string) error {
	if strings.TrimSpace(objectTenantID) == "" {
		return kernel.Forbidden("业务对象缺少租户归属")
	}
	if objectTenantID != s.TenantID {
		return kernel.Forbidden("业务对象不属于当前租户")
	}
	return nil
}

// AddMember 仅允许具备成员管理权限的作用域添加成员，并拒绝未知角色与重复成员。
func (s *Service) AddMember(actor Scope, tenantID, userID string, role model.TenantRole) error {
	if err := actor.RequireWrite(func(p model.TenantPermissions) bool { return p.ManageMembers }, "无权管理租户成员"); err != nil {
		return err
	}
	if err := actor.AssertSameTenant(tenantID); err != nil {
		return err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return kernel.BadAuthRequest("成员用户不能为空")
	}
	if !model.ValidTenantRole(role) {
		return kernel.BadAuthRequest("成员角色无效")
	}
	if role == model.TenantRoleOwner {
		return kernel.Forbidden("不允许通过成员接口直接授予所有者")
	}
	if existing, err := s.repo.Membership(tenantID, userID); err == nil && existing != nil {
		return kernel.NewAppError(409, "该用户已是租户成员")
	}
	return s.repo.PutMembership(&model.TenantMembership{
		TenantID: tenantID, UserID: userID, Role: role,
	})
}

// UpdateMemberRole 只修改既有成员的角色。新增与修改必须走不同入口，
// 否则“改角色”会被新增路径的重复检查判成冲突。
func (s *Service) UpdateMemberRole(actor Scope, tenantID, userID string, role model.TenantRole) error {
	if err := actor.RequireWrite(func(p model.TenantPermissions) bool { return p.ManageMembers }, "无权管理租户成员"); err != nil {
		return err
	}
	if err := actor.AssertSameTenant(tenantID); err != nil {
		return err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return kernel.BadAuthRequest("成员用户不能为空")
	}
	if !model.ValidTenantRole(role) {
		return kernel.BadAuthRequest("成员角色无效")
	}
	if role == model.TenantRoleOwner {
		return kernel.Forbidden("不允许通过成员接口直接授予所有者")
	}
	existing, err := s.repo.Membership(tenantID, userID)
	if err != nil || existing == nil {
		return kernel.NotFound("成员不存在")
	}
	if existing.Role == model.TenantRoleOwner {
		return kernel.Forbidden("不允许通过成员接口降级租户所有者")
	}
	existing.Role = role
	return s.repo.PutMembership(existing)
}

// RemoveMember 拒绝移除最后一名所有者，避免租户失去可管理主体。
func (s *Service) RemoveMember(actor Scope, tenantID, userID string) error {
	if err := actor.RequireWrite(func(p model.TenantPermissions) bool { return p.ManageMembers }, "无权管理租户成员"); err != nil {
		return err
	}
	if err := actor.AssertSameTenant(tenantID); err != nil {
		return err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return kernel.BadAuthRequest("成员用户不能为空")
	}
	target, err := s.repo.Membership(tenantID, userID)
	if err != nil {
		return kernel.NotFound("成员不存在")
	}
	if target.Role == model.TenantRoleOwner {
		owners, err := s.repo.CountOwners(tenantID)
		if err != nil {
			return err
		}
		if owners <= 1 {
			return kernel.Forbidden("租户至少需要保留一名所有者")
		}
	}
	return s.repo.DeleteMembership(tenantID, userID)
}

// VisibleTenants 返回用户可访问的租户列表，用于登录后的空间选择。
func (s *Service) VisibleTenants(userID string) ([]model.Tenant, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, kernel.Unauthorized("缺少用户身份")
	}
	if s == nil || s.repo == nil {
		return nil, kernel.Unauthorized("租户服务未初始化")
	}
	memberships, err := s.repo.MembershipsByUser(userID)
	if err != nil {
		return nil, err
	}
	visible := make([]model.Tenant, 0, len(memberships))
	for _, membership := range memberships {
		value, err := s.repo.Tenant(membership.TenantID)
		if err != nil {
			continue
		}
		if value.Status != model.TenantStatusActive {
			continue
		}
		visible = append(visible, *value)
	}
	return visible, nil
}
