package repository

import (
	"path/filepath"
	"testing"
	"time"

	"huabu/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func openTenantTestDB(t *testing.T) *Repository {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "tenant.db") + "?_busy_timeout=5000&_journal_mode=WAL"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.Tenant{}, &model.TenantMembership{}, &model.IDSequence{}); err != nil {
		t.Fatal(err)
	}
	return New(db)
}

func TestCreatePersonalTenantWritesOwnerMembership(t *testing.T) {
	repo := openTenantTestDB(t)
	tenant, err := repo.CreatePersonalTenant("user-1", "个人空间")
	if err != nil {
		t.Fatal(err)
	}
	if tenant.Kind != "personal" || tenant.Status != model.TenantStatusActive || tenant.OwnerUserID != "user-1" {
		t.Fatalf("tenant=%+v", tenant)
	}
	membership, err := repo.Membership(tenant.ID, "user-1")
	if err != nil {
		t.Fatal(err)
	}
	if membership.Role != model.TenantRoleOwner {
		t.Fatalf("role=%s", membership.Role)
	}
	visible, err := repo.MembershipsByUser("user-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(visible) != 1 || visible[0].TenantID != tenant.ID {
		t.Fatalf("memberships=%+v", visible)
	}
}

func TestPersonalTenantIDsAreDistinct(t *testing.T) {
	repo := openTenantTestDB(t)
	first, err := repo.CreatePersonalTenant("user-1", "空间一")
	if err != nil {
		t.Fatal(err)
	}
	second, err := repo.CreatePersonalTenant("user-2", "空间二")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == second.ID {
		t.Fatalf("duplicated tenant id %s", first.ID)
	}
}

func TestPutMembershipUpsertsRole(t *testing.T) {
	repo := openTenantTestDB(t)
	tenant, err := repo.CreatePersonalTenant("owner-1", "团队空间")
	if err != nil {
		t.Fatal(err)
	}
	first := &model.TenantMembership{
		TenantID: tenant.ID, UserID: "member-1", Role: model.TenantRoleViewer,
		InvitedBy: "owner-1", UpdatedAt: time.Now(),
	}
	if err := repo.PutMembership(first); err != nil {
		t.Fatal(err)
	}
	second := &model.TenantMembership{
		TenantID: tenant.ID, UserID: "member-1", Role: model.TenantRoleMember,
		InvitedBy: "owner-1", UpdatedAt: time.Now(),
	}
	if err := repo.PutMembership(second); err != nil {
		t.Fatal(err)
	}
	members, err := repo.MembershipsByTenant(tenant.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 2 {
		t.Fatalf("members=%+v", members)
	}
	for _, member := range members {
		if member.UserID == "member-1" && member.Role != model.TenantRoleMember {
			t.Fatalf("role not updated: %+v", member)
		}
	}
}

func TestCountOwnersAndDeleteMembership(t *testing.T) {
	repo := openTenantTestDB(t)
	tenant, err := repo.CreatePersonalTenant("owner-1", "团队空间")
	if err != nil {
		t.Fatal(err)
	}
	owners, err := repo.CountOwners(tenant.ID)
	if err != nil {
		t.Fatal(err)
	}
	if owners != 1 {
		t.Fatalf("owners=%d", owners)
	}
	if err := repo.DeleteMembership(tenant.ID, "owner-1"); err != nil {
		t.Fatal(err)
	}
	owners, err = repo.CountOwners(tenant.ID)
	if err != nil {
		t.Fatal(err)
	}
	if owners != 0 {
		t.Fatalf("owners=%d", owners)
	}
}
