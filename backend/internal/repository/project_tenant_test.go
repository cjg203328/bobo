package repository

import (
	"errors"
	"path/filepath"
	"testing"

	"huabu/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func openProjectTenantDB(t *testing.T) *Repository {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "project-tenant.db") + "?_busy_timeout=5000&_journal_mode=WAL"
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
	if err := db.AutoMigrate(&model.Project{}); err != nil {
		t.Fatal(err)
	}
	return New(db)
}

func seedTenantProjects(t *testing.T, repo *Repository) {
	t.Helper()
	for _, item := range []model.Project{
		{ID: "p-alpha", TenantID: "tn_a", UserID: "user-a", Name: "A 空间项目"},
		{ID: "p-beta", TenantID: "tn_b", UserID: "user-b", Name: "B 空间项目"},
		{ID: "p-alpha-shared", TenantID: "tn_a", UserID: "user-b", Name: "A 空间协作项目"},
	} {
		if err := repo.CreateProject(&item); err != nil {
			t.Fatal(err)
		}
	}
}

func TestProjectsInTenantExcludesOtherTenants(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)

	projects, err := repo.ProjectsInTenant("tn_a")
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 2 {
		t.Fatalf("tn_a projects=%d", len(projects))
	}
	for _, item := range projects {
		if item.TenantID != "tn_a" {
			t.Fatalf("leaked project from %s: %s", item.TenantID, item.ID)
		}
	}
	other, err := repo.ProjectsInTenant("tn_b")
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 1 || other[0].ID != "p-beta" {
		t.Fatalf("tn_b projects=%+v", other)
	}
}

// 同一租户内不同创建者的项目都应收得，租户才是边界，创建者不是。
func TestProjectsInTenantIncludesCollaboratorsWork(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)
	projects, err := repo.ProjectsInTenant("tn_a")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, item := range projects {
		seen[item.ID] = true
	}
	if !seen["p-alpha-shared"] {
		t.Fatal("collaborator project hidden inside the same tenant")
	}
}

func TestProjectsInTenantRejectsEmptyTenant(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)
	if _, err := repo.ProjectsInTenant(""); !errors.Is(err, ErrProjectTenantMissing) {
		t.Fatalf("empty tenant err=%v", err)
	}
	if _, _, err := repo.ProjectsInTenantPage("", 1, 10); !errors.Is(err, ErrProjectTenantMissing) {
		t.Fatalf("empty tenant page err=%v", err)
	}
	if _, err := repo.ProjectInTenant("", "p-alpha"); !errors.Is(err, ErrProjectTenantMissing) {
		t.Fatalf("empty tenant get err=%v", err)
	}
}

func TestProjectsInTenantPageCountsWithinTenant(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)
	projects, total, err := repo.ProjectsInTenantPage("tn_a", 1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(projects) != 1 {
		t.Fatalf("total=%d page=%d", total, len(projects))
	}
	if projects[0].TenantID != "tn_a" {
		t.Fatalf("page leaked tenant %s", projects[0].TenantID)
	}
}

func TestProjectInTenantHidesForeignRows(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)
	project, err := repo.ProjectInTenant("tn_a", "p-alpha")
	if err != nil {
		t.Fatal(err)
	}
	if project.ID != "p-alpha" {
		t.Fatalf("project=%s", project.ID)
	}
	if _, err := repo.ProjectInTenant("tn_b", "p-alpha"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross tenant get err=%v", err)
	}
}

func TestProjectTenantOfReportsMissingOwnership(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)
	tenantID, err := repo.ProjectTenantOf("p-beta")
	if err != nil {
		t.Fatal(err)
	}
	if tenantID != "tn_b" {
		t.Fatalf("tenant=%s", tenantID)
	}
	if err := repo.CreateProject(&model.Project{ID: "p-orphan", UserID: "user-x", Name: "无归属"}); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ProjectTenantOf("p-orphan"); !errors.Is(err, ErrProjectTenantMissing) {
		t.Fatalf("orphan tenant err=%v", err)
	}
	pending, err := repo.projectsWithoutTenant()
	if err != nil {
		t.Fatal(err)
	}
	if pending != 1 {
		t.Fatalf("pending=%d", pending)
	}
}

func TestBackfillProjectTenantKeepsExistingOwnership(t *testing.T) {
	repo := openProjectTenantDB(t)
	seedTenantProjects(t, repo)
	if err := repo.BackfillProjectTenant("p-alpha", "tn_b"); err != nil {
		t.Fatal(err)
	}
	tenantID, err := repo.ProjectTenantOf("p-alpha")
	if err != nil {
		t.Fatal(err)
	}
	if tenantID != "tn_a" {
		t.Fatalf("existing ownership overwritten: %s", tenantID)
	}
	if err := repo.BackfillProjectTenant("p-alpha", ""); !errors.Is(err, ErrProjectTenantMissing) {
		t.Fatalf("empty backfill err=%v", err)
	}
}

func TestBackfillProjectTenantFillsOrphanRow(t *testing.T) {
	repo := openProjectTenantDB(t)
	if err := repo.CreateProject(&model.Project{ID: "p-orphan", UserID: "user-x", Name: "无归属"}); err != nil {
		t.Fatal(err)
	}
	if err := repo.BackfillProjectTenant("p-orphan", "tn_a"); err != nil {
		t.Fatal(err)
	}
	tenantID, err := repo.ProjectTenantOf("p-orphan")
	if err != nil {
		t.Fatal(err)
	}
	if tenantID != "tn_a" {
		t.Fatalf("tenant=%s", tenantID)
	}
}

// ProjectCanvasSummariesByProject 是项目汇总里统计画布用的入口。
// 它必须按项目收全，不再按创建者过滤，否则协作者的画布会被算成 0。
func TestProjectCanvasSummariesByProjectIgnoresCreator(t *testing.T) {
	repo := openProjectTenantDB(t)
	if err := repo.DB().AutoMigrate(&model.CanvasProject{}); err != nil {
		t.Fatal(err)
	}
	for _, item := range []model.CanvasProject{
		{ID: "c-mine", UserID: "user-a", ProjectID: "p-alpha", Title: "我的画布"},
		{ID: "c-teammate", UserID: "user-b", ProjectID: "p-alpha", Title: "协作者画布"},
		{ID: "c-foreign", UserID: "user-c", ProjectID: "p-beta", Title: "别家画布"},
	} {
		if err := repo.DB().Create(&item).Error; err != nil {
			t.Fatal(err)
		}
	}
	canvases, err := repo.ProjectCanvasSummariesByProject("p-alpha")
	if err != nil {
		t.Fatal(err)
	}
	if len(canvases) != 2 {
		t.Fatalf("canvases=%d", len(canvases))
	}
	seen := map[string]bool{}
	for _, item := range canvases {
		seen[item.ID] = true
		if item.ProjectID != "p-alpha" {
			t.Fatalf("cross project canvas leaked: %s", item.ID)
		}
	}
	if !seen["c-mine"] || !seen["c-teammate"] {
		t.Fatalf("creator filter still applied: %+v", seen)
	}
	if seen["c-foreign"] {
		t.Fatal("canvas from another project leaked")
	}
}

// ProjectForUser 是写路径的归属入口（Owned/Active 都走它）。
// 它的语义必须是：同租户成员可读，跨租户一律当作不存在。
func TestProjectForUserResolvesByTenantMembership(t *testing.T) {
	repo := openProjectTenantDB(t)
	if err := repo.DB().AutoMigrate(&model.Tenant{}, &model.TenantMembership{}); err != nil {
		t.Fatal(err)
	}
	for _, item := range []model.Tenant{
		{ID: "tn_a", Name: "A 空间", Kind: "team", Status: model.TenantStatusActive},
		{ID: "tn_b", Name: "B 空间", Kind: "team", Status: model.TenantStatusActive},
	} {
		if err := repo.DB().Create(&item).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []model.TenantMembership{
		{TenantID: "tn_a", UserID: "creator", Role: model.TenantRoleOwner},
		{TenantID: "tn_a", UserID: "collaborator", Role: model.TenantRoleMember},
		{TenantID: "tn_b", UserID: "outsider", Role: model.TenantRoleOwner},
	} {
		if err := repo.DB().Create(&item).Error; err != nil {
			t.Fatal(err)
		}
	}
	project := model.Project{ID: "p-shared", TenantID: "tn_a", UserID: "creator", Name: "共享项目"}
	if err := repo.CreateProject(&project); err != nil {
		t.Fatal(err)
	}

	// 创建者本人可读。
	if _, err := repo.ProjectForUser("creator", "p-shared"); err != nil {
		t.Fatalf("creator read failed: %v", err)
	}
	// 同租户协作者可读：可见性来自成员关系，不是创建者字段。
	if _, err := repo.ProjectForUser("collaborator", "p-shared"); err != nil {
		t.Fatalf("collaborator read failed: %v", err)
	}
	// 跨租户必须表现为不存在，不能用错误码探测他人项目。
	if _, err := repo.ProjectForUser("outsider", "p-shared"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("outsider read err=%v, want not found", err)
	}
	// 非成员但知道 ID 也不行。
	if _, err := repo.ProjectForUser("nobody", "p-shared"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("non-member read err=%v, want not found", err)
	}
}

// 没有租户归属的历史行退化为创建者精确匹配，不放宽任何权限。
func TestProjectForUserKeepsLegacyRowsOwnerOnly(t *testing.T) {
	repo := openProjectTenantDB(t)
	if err := repo.DB().AutoMigrate(&model.Tenant{}, &model.TenantMembership{}); err != nil {
		t.Fatal(err)
	}
	if err := repo.CreateProject(&model.Project{ID: "p-legacy", UserID: "legacy-owner", Name: "无归属历史项目"}); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ProjectForUser("legacy-owner", "p-legacy"); err != nil {
		t.Fatalf("legacy owner read failed: %v", err)
	}
	if _, err := repo.ProjectForUser("someone-else", "p-legacy"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("legacy foreign read err=%v, want not found", err)
	}
}
