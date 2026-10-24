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

func TestV18ProjectTenantOwnershipBackfillsLegacyRows(t *testing.T) {
	db := openHistorical(t, "preview-v9")
	workspace := model.Workspace{ID: "workspace-v18", Name: "归属工作区"}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Project{}); err != nil {
		t.Fatal(err)
	}
	legacy := model.Project{ID: "legacy-no-tenant", UserID: workspace.ID, Name: "无归属项目"}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Project{}).Where("id = ?", legacy.ID).Update("tenant_id", "").Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := RequireLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	if !db.Migrator().HasColumn(&model.Project{}, "tenant_id") {
		t.Fatal("v18 did not add projects.tenant_id")
	}
	var reloaded model.Project
	if err := db.First(&reloaded, "id = ?", legacy.ID).Error; err != nil {
		t.Fatal(err)
	}
	if reloaded.TenantID != workspace.ID {
		t.Fatalf("legacy project tenant_id = %q, want %q", reloaded.TenantID, workspace.ID)
	}
	var migration localSchemaMigration
	if err := db.First(&migration, "version = ?", 18).Error; err != nil || migration.Name != "project-tenant-ownership" {
		t.Fatalf("v18 identity = %+v, err = %v", migration, err)
	}
}

func TestV18ProjectTenantOwnershipKeepsExistingValue(t *testing.T) {
	db := openHistorical(t, "preview-v9")
	workspace := model.Workspace{ID: "workspace-v18-keep", Name: "保留工作区"}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	project := model.Project{ID: "explicit-tenant", UserID: workspace.ID, Name: "已有归属", TenantID: "tn_explicit"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	if err := migrateProjectTenantID(db); err != nil {
		t.Fatal(err)
	}
	var reloaded model.Project
	if err := db.First(&reloaded, "id = ?", project.ID).Error; err != nil {
		t.Fatal(err)
	}
	if reloaded.TenantID != "tn_explicit" {
		t.Fatalf("existing tenant ownership overwritten: %q", reloaded.TenantID)
	}
}

func TestV18SchemaRejectsMissingProjectTenantIndex(t *testing.T) {
	db := openHistorical(t, "preview-v9")
	if err := MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("DROP INDEX idx_projects_tenant").Error; err != nil {
		t.Fatal(err)
	}
	if err := RequireLocalSchema(db); err == nil {
		t.Fatal("schema readiness accepted a project table without tenant index")
	}
}

func TestV18SchemaRejectsMissingProjectTenantColumn(t *testing.T) {
	db := openHistorical(t, "preview-v9")
	if err := MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("DROP INDEX idx_projects_tenant").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("ALTER TABLE projects DROP COLUMN tenant_id").Error; err != nil {
		t.Fatal(err)
	}
	if err := RequireLocalSchema(db); err == nil {
		t.Fatal("schema readiness accepted a project table without tenant column")
	}
}
