package tenant

import (
	"errors"
	"testing"

	"huabu/backend/internal/kernel"
	"huabu/backend/internal/model"
)

var errNotFound = errors.New("not found")

type fakeRepo struct {
	tenants     map[string]*model.Tenant
	memberships map[string]map[string]*model.TenantMembership
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		tenants:     map[string]*model.Tenant{},
		memberships: map[string]map[string]*model.TenantMembership{},
	}
}

func (f *fakeRepo) Tenant(id string) (*model.Tenant, error) {
	value, ok := f.tenants[id]
	if !ok {
		return nil, errNotFound
	}
	return value, nil
}

func (f *fakeRepo) Membership(tenantID, userID string) (*model.TenantMembership, error) {
	if members, ok := f.memberships[tenantID]; ok {
		if value, ok := members[userID]; ok {
			return value, nil
		}
	}
	return nil, errNotFound
}

func (f *fakeRepo) MembershipsByUser(userID string) ([]model.TenantMembership, error) {
	var values []model.TenantMembership
	for _, members := range f.memberships {
		for _, value := range members {
			if value.UserID == userID {
				values = append(values, *value)
			}
		}
	}
	return values, nil
}

func (f *fakeRepo) MembershipsByTenant(tenantID string) ([]model.TenantMembership, error) {
	var values []model.TenantMembership
	for _, value := range f.memberships[tenantID] {
		values = append(values, *value)
	}
	return values, nil
}

func (f *fakeRepo) CreateTenant(value *model.Tenant, owner *model.TenantMembership) error {
	f.tenants[value.ID] = value
	f.put(owner)
	return nil
}

func (f *fakeRepo) PutMembership(value *model.TenantMembership) error {
	f.put(value)
	return nil
}

func (f *fakeRepo) DeleteMembership(tenantID, userID string) error {
	if members, ok := f.memberships[tenantID]; ok {
		delete(members, userID)
	}
	return nil
}

func (f *fakeRepo) CountOwners(tenantID string) (int64, error) {
	var count int64
	for _, value := range f.memberships[tenantID] {
		if value.Role == model.TenantRoleOwner {
			count++
		}
	}
	return count, nil
}

func (f *fakeRepo) put(value *model.TenantMembership) {
	if f.memberships[value.TenantID] == nil {
		f.memberships[value.TenantID] = map[string]*model.TenantMembership{}
	}
	f.memberships[value.TenantID][value.UserID] = value
}

func seedTeam(repo *fakeRepo) {
	repo.tenants["tn_team"] = &model.Tenant{ID: "tn_team", Name: "团队", Kind: "team", Status: model.TenantStatusActive, OwnerUserID: "owner"}
	repo.put(&model.TenantMembership{TenantID: "tn_team", UserID: "owner", Role: model.TenantRoleOwner})
	repo.put(&model.TenantMembership{TenantID: "tn_team", UserID: "viewer", Role: model.TenantRoleViewer})
	repo.tenants["tn_other"] = &model.Tenant{ID: "tn_other", Name: "别家", Kind: "team", Status: model.TenantStatusActive, OwnerUserID: "stranger"}
	repo.put(&model.TenantMembership{TenantID: "tn_other", UserID: "stranger", Role: model.TenantRoleOwner})
}

func TestAuthorizeSeparatesTenants(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	service := NewService(repo)

	scope, err := service.Authorize("tn_team", "owner")
	if err != nil {
		t.Fatal(err)
	}
	if scope.TenantID != "tn_team" || scope.Role != model.TenantRoleOwner || !scope.Perms.ManageMembers {
		t.Fatalf("scope=%+v", scope)
	}
	if err := scope.AssertSameTenant("tn_other"); err == nil {
		t.Fatal("cross tenant access must be rejected")
	}
	if err := scope.AssertSameTenant("tn_team"); err != nil {
		t.Fatal(err)
	}
}

func TestAuthorizeRejectsNonMemberAndMissingIdentity(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	service := NewService(repo)

	if _, err := service.Authorize("tn_team", "stranger"); err == nil {
		t.Fatal("non member must be rejected")
	} else if appErr, ok := err.(*kernel.AppError); !ok || appErr.Status != 403 {
		t.Fatalf("err=%v", err)
	}
	if _, err := service.Authorize("tn_team", ""); err == nil {
		t.Fatal("empty identity must be rejected")
	}
}

func TestAuthorizeRejectsSuspendedTenant(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	repo.tenants["tn_team"].Status = model.TenantStatusSuspended
	if _, err := NewService(repo).Authorize("tn_team", "owner"); err == nil {
		t.Fatal("suspended tenant must be rejected")
	}
}

func TestViewModelerCannotWrite(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	service := NewService(repo)
	scope, err := service.Authorize("tn_team", "viewer")
	if err != nil {
		t.Fatal(err)
	}
	if err := scope.RequireWrite(func(p model.TenantPermissions) bool { return p.WriteProject }, "无权写入项目"); err == nil {
		t.Fatal("viewer must not write project")
	}
	if err := scope.RequireWrite(func(p model.TenantPermissions) bool { return p.ReadTenant }, "无权读取"); err != nil {
		t.Fatal(err)
	}
}

func TestAddMemberEnforcesPermissionsAndDuplicates(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	service := NewService(repo)

	viewerScope, err := service.Authorize("tn_team", "viewer")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.AddMember(viewerScope, "tn_team", "new-member", model.TenantRoleMember); err == nil {
		t.Fatal("viewer must not add members")
	}

	ownerScope, err := service.Authorize("tn_team", "owner")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.AddMember(ownerScope, "tn_team", "new-member", model.TenantRoleMember); err != nil {
		t.Fatal(err)
	}
	if err := service.AddMember(ownerScope, "tn_team", "new-member", model.TenantRoleMember); err == nil {
		t.Fatal("duplicate member must be rejected")
	}
	if err := service.AddMember(ownerScope, "tn_team", "other", model.TenantRole("root")); err == nil {
		t.Fatal("unknown role must be rejected")
	}
	if err := service.AddMember(ownerScope, "tn_team", "other", model.TenantRoleOwner); err == nil {
		t.Fatal("granting owner through member api must be rejected")
	}
	if err := service.AddMember(ownerScope, "tn_other", "other", model.TenantRoleMember); err == nil {
		t.Fatal("cross tenant member write must be rejected")
	}
}

func TestRemoveMemberKeepsLastOwner(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	service := NewService(repo)
	ownerScope, err := service.Authorize("tn_team", "owner")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.RemoveMember(ownerScope, "tn_team", "owner"); err == nil {
		t.Fatal("removing last owner must be rejected")
	}
	if err := service.RemoveMember(ownerScope, "tn_team", "viewer"); err != nil {
		t.Fatal(err)
	}
	if err := service.RemoveMember(ownerScope, "tn_team", "ghost"); err == nil {
		t.Fatal("removing missing member must be rejected")
	}
}

func TestVisibleTenantsSkipsSuspended(t *testing.T) {
	repo := newFakeRepo()
	seedTeam(repo)
	repo.tenants["tn_idle"] = &model.Tenant{ID: "tn_idle", Name: "停用", Kind: "team", Status: model.TenantStatusSuspended}
	repo.put(&model.TenantMembership{TenantID: "tn_idle", UserID: "owner", Role: model.TenantRoleOwner})

	visible, err := NewService(repo).VisibleTenants("owner")
	if err != nil {
		t.Fatal(err)
	}
	if len(visible) != 1 || visible[0].ID != "tn_team" {
		t.Fatalf("visible=%+v", visible)
	}
}
