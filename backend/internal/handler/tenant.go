package handler

import (
	"strings"

	"github.com/gin-gonic/gin"

	"huabu/backend/internal/app"
	"huabu/backend/internal/model"
	"huabu/backend/internal/repository"
	"huabu/backend/internal/tenant"
)

// RegisterTenantRoutes 暴露租户空间与成员管理面。所有写操作都先经过
// tenant.Service 的角色判定，handler 只负责解析输入与投影结果。
func RegisterTenantRoutes(r *gin.RouterGroup, svc *app.Service) {
	r.GET("/tenants", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		repo := repository.New(svc.Database())
		service := tenant.NewService(repo)
		visible, err := service.VisibleTenants(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		items := make([]gin.H, 0, len(visible))
		for _, value := range visible {
			role := ""
			if membership, err := repo.Membership(value.ID, user.ID); err == nil {
				role = string(membership.Role)
			}
			items = append(items, gin.H{
				"id": value.ID, "name": value.Name, "kind": value.Kind,
				"role": role, "status": value.Status,
			})
		}
		ok(c, gin.H{"tenants": items})
	})

	r.POST("/tenants", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var body struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			fail(c, 400, app.BadAuthRequest("请求体格式错误"))
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			fail(c, 400, app.BadAuthRequest("空间名称不能为空"))
			return
		}
		repo := repository.New(svc.Database())
		var created *model.Tenant
		if body.Kind == "personal" {
			created, err = repo.CreatePersonalTenant(user.ID, name)
		} else {
			created, err = repo.CreateTeamTenant(user.ID, name)
		}
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"id": created.ID, "name": created.Name, "kind": created.Kind, "role": string(model.TenantRoleOwner)})
	})

	r.GET("/tenants/:tenantId/scope", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		scope, err := tenant.NewService(repository.New(svc.Database())).Authorize(c.Param("tenantId"), user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{
			"tenantId": scope.TenantID, "userId": scope.UserID, "role": scope.Role,
			"permissions": gin.H{
				"readTenant": scope.Perms.ReadTenant, "writeProject": scope.Perms.WriteProject,
				"writeAsset": scope.Perms.WriteAsset, "writeConversation": scope.Perms.WriteConversation,
				"manageMembers": scope.Perms.ManageMembers, "manageBilling": scope.Perms.ManageBilling,
				"transferOwner": scope.Perms.TransferOwner,
			},
		})
	})

	members := r.Group("/tenants/:tenantId/members")
	members.GET("", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		repo := repository.New(svc.Database())
		service := tenant.NewService(repo)
		scope, err := service.Authorize(c.Param("tenantId"), user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		values, err := repo.MembershipsByTenant(scope.TenantID)
		if err != nil {
			failService(c, err)
			return
		}
		items := make([]gin.H, 0, len(values))
		for _, value := range values {
			items = append(items, gin.H{
				"userId": value.UserID, "role": value.Role,
				"invitedBy": value.InvitedBy, "createdAt": value.CreatedAt,
			})
		}
		ok(c, gin.H{"members": items})
	})

	members.POST("", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var body struct {
			UserID string `json:"userId"`
			Role   string `json:"role"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			fail(c, 400, app.BadAuthRequest("请求体格式错误"))
			return
		}
		if strings.TrimSpace(body.Role) == "" {
			body.Role = string(model.TenantRoleMember)
		}
		service := tenant.NewService(repository.New(svc.Database()))
		scope, err := service.Authorize(c.Param("tenantId"), user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		if err := service.AddMember(scope, scope.TenantID, body.UserID, model.TenantRole(body.Role)); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"userId": body.UserID, "role": body.Role})
	})

	members.PATCH("/:userId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var body struct {
			Role string `json:"role"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			fail(c, 400, app.BadAuthRequest("请求体格式错误"))
			return
		}
		repo := repository.New(svc.Database())
		service := tenant.NewService(repo)
		scope, err := service.Authorize(c.Param("tenantId"), user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		if err := service.UpdateMemberRole(scope, scope.TenantID, c.Param("userId"), model.TenantRole(body.Role)); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"userId": c.Param("userId"), "role": body.Role})
	})

	members.DELETE("/:userId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		service := tenant.NewService(repository.New(svc.Database()))
		scope, err := service.Authorize(c.Param("tenantId"), user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		if err := service.RemoveMember(scope, scope.TenantID, c.Param("userId")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"removed": c.Param("userId")})
	})
}

// requestTenantScope 解析本次请求的租户作用域。显式传入的 X-Tenant-Id
// 必须命中成员关系；未传时退化为该用户最早加入的可用空间（桌面端即个人空间）。
// 两条路径都经过 tenant.Service.Authorize，不存在“跳过校验”的分支。
func requestTenantScope(c *gin.Context, svc *app.Service, userID string) (tenant.Scope, error) {
	repo := repository.New(svc.Database())
	service := tenant.NewService(repo)
	requested := strings.TrimSpace(c.GetHeader("X-Tenant-Id"))
	if requested == "" {
		primary, err := repo.PrimaryTenantForUser(userID)
		if err != nil {
			return tenant.Scope{}, app.Forbidden("当前用户没有可用的工作空间")
		}
		requested = primary
	}
	return service.Authorize(requested, userID)
}

// requireRequestedTenantProject 在请求显式声明空间时，校验项目确实属于该空间。
// 未传 X-Tenant-Id 时不做断言：现有客户端尚未携带该头，若默认回落到个人空间，
// 团队空间里的项目会被误判成 404，等于用隔离规则砸掉已有功能。
func requireRequestedTenantProject(c *gin.Context, svc *app.Service, userID string, projectID string) error {
	if strings.TrimSpace(c.GetHeader("X-Tenant-Id")) == "" {
		return nil
	}
	scope, err := requestTenantScope(c, svc, userID)
	if err != nil {
		return err
	}
	_, err = svc.OwnedProjectInTenant(userID, scope.TenantID, projectID)
	return err
}
