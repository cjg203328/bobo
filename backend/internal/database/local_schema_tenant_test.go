package database

import (
	"testing"

	"huabu/backend/internal/model"
)

func TestV17TenantMigrationBackfillsPersonalWorkspace(t *testing.T) {
	db := openHistorical(t, "preview-v9")
	workspace := model.Workspace{ID: "workspace-legacy", Name: "既有工作区"}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := RequireLocalSchema(db); err != nil {
		t.Fatal(err)
	}

	var tenant model.Tenant
	if err := db.First(&tenant, "id = ?", workspace.ID).Error; err != nil {
		t.Fatal(err)
	}
	if tenant.Kind != "personal" || tenant.OwnerUserID != workspace.ID || tenant.Name != workspace.Name {
		t.Fatalf("backfilled tenant = %+v", tenant)
	}
	var membership model.TenantMembership
	if err := db.First(&membership, "tenant_id = ? AND user_id = ?", workspace.ID, workspace.ID).Error; err != nil {
		t.Fatal(err)
	}
	if membership.Role != model.TenantRoleOwner {
		t.Fatalf("backfilled membership = %+v", membership)
	}
	var migration localSchemaMigration
	if err := db.First(&migration, "version = ?", 17).Error; err != nil || migration.Name != "tenant-membership" {
		t.Fatalf("v17 identity = %+v, err = %v", migration, err)
	}

	if err := MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	var tenantCount, membershipCount int64
	db.Model(&model.Tenant{}).Count(&tenantCount)
	db.Model(&model.TenantMembership{}).Count(&membershipCount)
	if tenantCount != 1 || membershipCount != 1 {
		t.Fatalf("migration retry duplicated rows: tenants=%d memberships=%d", tenantCount, membershipCount)
	}

	if err := db.Migrator().DropTable(&model.TenantMembership{}); err != nil {
		t.Fatal(err)
	}
	if err := RequireLocalSchema(db); err == nil {
		t.Fatal("schema readiness accepted a missing tenant membership table")
	}
}
