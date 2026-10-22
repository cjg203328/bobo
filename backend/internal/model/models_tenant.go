package model

import "time"

// TenantRole 是租户内的成员角色，权限由角色而非界面决定。
type TenantRole string

const (
	TenantRoleOwner  TenantRole = "owner"
	TenantRoleAdmin  TenantRole = "admin"
	TenantRoleMember TenantRole = "member"
	TenantRoleViewer TenantRole = "viewer"
)

// TenantStatus 控制租户是否仍可读写。
type TenantStatus string

const (
	TenantStatusActive    TenantStatus = "active"
	TenantStatusSuspended TenantStatus = "suspended"
)

// Tenant 是远端数据归属的根。个人空间也建租户，以便项目、素材、会话在
// 个人与团队之间共用同一套隔离规则，而不是两套并列的归属判断。
type Tenant struct {
	ID          string       `json:"id" gorm:"primaryKey;size:80"`
	Name        string       `json:"name" gorm:"size:120"`
	Kind        string       `json:"kind" gorm:"size:24;index"` // personal | team
	Status      TenantStatus `json:"status" gorm:"size:24;index"`
	OwnerUserID string       `json:"ownerUserId" gorm:"index;size:80"`
	CreatedAt   time.Time    `json:"createdAt"`
	UpdatedAt   time.Time    `json:"updatedAt"`
}

// TenantMembership 是用户与租户的唯一关系表。复合主键保证同一用户在同一
// 租户内只有一条记录，避免重复成员导致角色判定漂移。
type TenantMembership struct {
	TenantID  string     `json:"tenantId" gorm:"primaryKey;size:80;index:idx_tenant_memberships_user,priority:2"`
	UserID    string     `json:"userId" gorm:"primaryKey;size:80;index:idx_tenant_memberships_user,priority:1"`
	Role      TenantRole `json:"role" gorm:"size:24;index"`
	InvitedBy string     `json:"invitedBy,omitempty" gorm:"size:80"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

func (Tenant) TableName() string { return "tenants" }

func (TenantMembership) TableName() string { return "tenant_memberships" }

// Grants 描述角色允许的写操作集合。viewer 只读，member 可写业务数据但不能
// 管理成员，admin 可管理成员与配置，owner 额外可转移归属。
type TenantPermissions struct {
	ReadTenant        bool
	WriteProject      bool
	WriteAsset        bool
	WriteConversation bool
	ManageMembers     bool
	ManageBilling     bool
	TransferOwner     bool
}

// PermissionsFor 是角色到权限的唯一映射来源；handler 与 service 都只能引用
// 这里的结果，不得在各自位置复制角色判断。
func PermissionsFor(role TenantRole) TenantPermissions {
	switch role {
	case TenantRoleOwner:
		return TenantPermissions{
			ReadTenant: true, WriteProject: true, WriteAsset: true,
			WriteConversation: true, ManageMembers: true, ManageBilling: true, TransferOwner: true,
		}
	case TenantRoleAdmin:
		return TenantPermissions{
			ReadTenant: true, WriteProject: true, WriteAsset: true,
			WriteConversation: true, ManageMembers: true, ManageBilling: true,
		}
	case TenantRoleMember:
		return TenantPermissions{
			ReadTenant: true, WriteProject: true, WriteAsset: true, WriteConversation: true,
		}
	case TenantRoleViewer:
		return TenantPermissions{ReadTenant: true}
	default:
		return TenantPermissions{}
	}
}

// ValidTenantRole 用于入口校验，拒绝未知角色写库。
func ValidTenantRole(role TenantRole) bool {
	switch role {
	case TenantRoleOwner, TenantRoleAdmin, TenantRoleMember, TenantRoleViewer:
		return true
	default:
		return false
	}
}
