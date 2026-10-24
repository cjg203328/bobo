package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"huabu/backend/internal/app"
	"huabu/backend/internal/database"
	"huabu/backend/internal/model"
	"huabu/backend/internal/repository"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type tenantRoutesEnv struct {
	router *gin.Engine
	svc    *app.Service
	repo   *repository.Repository
	db     *gorm.DB
	owner  string
}

func newTenantRoutesEnv(t *testing.T) tenantRoutesEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dsn := "file:tenant-routes-" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})
	if err := database.MigrateLocalSchema(db); err != nil {
		t.Fatal(err)
	}
	svc := app.NewLocal(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	router := gin.New()
	RegisterTenantRoutes(router.Group("/api"), svc)
	owner, err := svc.LocalWorkspaceOwner()
	if err != nil {
		t.Fatal(err)
	}
	return tenantRoutesEnv{router: router, svc: svc, repo: repository.New(db), db: db, owner: owner.ID}
}

func svcClose(db **gorm.DB) error {
	return nil
}

func performTenantGet(t *testing.T, router *gin.Engine, path string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	requestNew := httptest.NewRequest(http.MethodGet, path, nil)
	router.ServeHTTP(recorder, requestNew)
	return recorder
}

func performTenantJSON(t *testing.T, router *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	requestNew := httptest.NewRequest(method, path, strings.NewReader(body))
	requestNew.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, requestNew)
	return recorder
}

func TestTenantRoutesListIncludesPersonalSpace(t *testing.T) {
	env := newTenantRoutesEnv(t)
	response := performTenantGet(t, env.router, "/api/tenants")
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var payload struct {
		Data struct {
			Tenants []struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
				Role string `json:"role"`
			} `json:"tenants"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Data.Tenants) != 1 {
		t.Fatalf("tenants=%+v", payload.Data.Tenants)
	}
	tenant := payload.Data.Tenants[0]
	if tenant.Kind != "personal" || tenant.Role != string(model.TenantRoleOwner) || tenant.ID == "" {
		t.Fatalf("tenant=%+v", tenant)
	}
	if tenant.ID != env.owner {
		t.Fatalf("personal tenant must be backfilled from workspace: %s vs %s", tenant.ID, env.owner)
	}
}

func TestTenantRoutesCreateTeamAndReportPermissions(t *testing.T) {
	env := newTenantRoutesEnv(t)
	created := performTenantJSON(t, env.router, http.MethodPost, "/api/tenants", `{"name":"设计团队","kind":"team"}`)
	if created.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", created.Code, created.Body.String())
	}
	var payload struct {
		Data struct {
			ID   string `json:"id"`
			Kind string `json:"kind"`
			Role string `json:"role"`
		} `json:"data"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Data.Kind != "team" || payload.Data.Role != string(model.TenantRoleOwner) {
		t.Fatalf("created=%+v", payload.Data)
	}
	scope := performTenantGet(t, env.router, "/api/tenants/"+payload.Data.ID+"/scope")
	if scope.Code != http.StatusOK {
		t.Fatalf("scope status=%d body=%s", scope.Code, scope.Body.String())
	}
	if !strings.Contains(scope.Body.String(), `"manageMembers":true`) || !strings.Contains(scope.Body.String(), `"transferOwner":true`) {
		t.Fatalf("owner scope lost permissions: %s", scope.Body.String())
	}
}

func TestTenantRoutesRejectEmptyName(t *testing.T) {
	env := newTenantRoutesEnv(t)
	created := performTenantJSON(t, env.router, http.MethodPost, "/api/tenants", `{"name":"   ","kind":"team"}`)
	if created.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", created.Code, created.Body.String())
	}
}

func TestTenantRoutesBlockCrossTenantAccess(t *testing.T) {
	env := newTenantRoutesEnv(t)
	foreign, err := env.repo.CreateTeamTenant("stranger", "别家团队")
	if err != nil {
		t.Fatal(err)
	}
	scope := performTenantGet(t, env.router, "/api/tenants/"+foreign.ID+"/scope")
	if scope.Code != http.StatusForbidden {
		t.Fatalf("cross tenant scope status=%d body=%s", scope.Code, scope.Body.String())
	}
	members := performTenantGet(t, env.router, "/api/tenants/"+foreign.ID+"/members")
	if members.Code != http.StatusForbidden {
		t.Fatalf("cross tenant members status=%d body=%s", members.Code, members.Body.String())
	}
	added := performTenantJSON(t, env.router, http.MethodPost, "/api/tenants/"+foreign.ID+"/members", `{"userId":"intruder","role":"member"}`)
	if added.Code != http.StatusForbidden {
		t.Fatalf("cross tenant member write status=%d body=%s", added.Code, added.Body.String())
	}
	var count int64
	if err := env.db.Model(&model.TenantMembership{}).Where("tenant_id = ? AND user_id = ?", foreign.ID, "intruder").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("cross tenant write leaked membership: %+v", count)
	}
}

func TestTenantRoutesMemberLifecycle(t *testing.T) {
	env := newTenantRoutesEnv(t)
	created := performTenantJSON(t, env.router, http.MethodPost, "/api/tenants", `{"name":"协作空间","kind":"team"}`)
	var payload struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	tenantID := payload.Data.ID

	added := performTenantJSON(t, env.router, http.MethodPost, "/api/tenants/"+tenantID+"/members", `{"userId":"member-1","role":"viewer"}`)
	if added.Code != http.StatusOK {
		t.Fatalf("add status=%d body=%s", added.Code, added.Body.String())
	}
	duplicated := performTenantJSON(t, env.router, http.MethodPost, "/api/tenants/"+tenantID+"/members", `{"userId":"member-1","role":"viewer"}`)
	if duplicated.Code != http.StatusConflict {
		t.Fatalf("duplicate status=%d body=%s", duplicated.Code, duplicated.Body.String())
	}
	promoted := performTenantJSON(t, env.router, http.MethodPatch, "/api/tenants/"+tenantID+"/members/member-1", `{"role":"member"}`)
	if promoted.Code != http.StatusOK {
		t.Fatalf("patch status=%d body=%s", promoted.Code, promoted.Body.String())
	}
	membership, err := env.repo.Membership(tenantID, "member-1")
	if err != nil {
		t.Fatal(err)
	}
	if membership.Role != model.TenantRoleMember {
		t.Fatalf("role=%s", membership.Role)
	}
	removed := performTenantJSON(t, env.router, http.MethodDelete, "/api/tenants/"+tenantID+"/members/member-1", "")
	if removed.Code != http.StatusOK {
		t.Fatalf("remove status=%d body=%s", removed.Code, removed.Body.String())
	}
	if _, err := env.repo.Membership(tenantID, "member-1"); err == nil {
		t.Fatal("membership still present after removal")
	}
	lastOwner := performTenantJSON(t, env.router, http.MethodDelete, "/api/tenants/"+tenantID+"/members/"+env.owner, "")
	if lastOwner.Code != http.StatusForbidden {
		t.Fatalf("last owner removal status=%d body=%s", lastOwner.Code, lastOwner.Body.String())
	}
}
