package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"huabu/backend/internal/app"
)

// 显式声明空间时，项目必须属于该空间。否则切换空间后仍能按 ID 读到旧空间数据，
// 隔离规则就只剩一个装饰用的请求头。
func TestProjectDetailHonoursRequestedTenant(t *testing.T) {
	env := newTenantRoutesEnv(t)
	RegisterProjectRoutes(env.router.Group("/api"), env.svc)

	personal, err := env.repo.PrimaryTenantForUser(env.owner)
	if err != nil {
		t.Fatal(err)
	}
	team, err := env.repo.CreateTeamTenant(env.owner, "团队空间")
	if err != nil {
		t.Fatal(err)
	}
	project, err := env.svc.CreateProject(env.owner, app.CreateProjectRequest{Name: "个人项目"})
	if err != nil {
		t.Fatal(err)
	}
	if project.TenantID != personal {
		t.Fatalf("project tenant = %q, want %q", project.TenantID, personal)
	}

	get := func(tenantID string) *httptest.ResponseRecorder {
		t.Helper()
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/projects/"+project.ID, nil)
		if tenantID != "" {
			request.Header.Set("X-Tenant-Id", tenantID)
		}
		env.router.ServeHTTP(recorder, request)
		return recorder
	}

	// 未声明空间：沿用项目自身归属，不因缺请求头把已有客户端挡死。
	if got := get(""); got.Code != http.StatusOK {
		t.Fatalf("no tenant header status=%d body=%s", got.Code, got.Body.String())
	}
	// 声明归属空间：放行。
	if got := get(personal); got.Code != http.StatusOK {
		t.Fatalf("owning tenant status=%d body=%s", got.Code, got.Body.String())
	}
	// 声明另一个自己是成员的团队空间：该项目不属于该空间，必须当作不存在。
	if got := get(team.ID); got.Code != http.StatusNotFound {
		t.Fatalf("foreign tenant status=%d body=%s", got.Code, got.Body.String())
	}
}

// 断言只对成员生效：声明一个自己根本不在其中的空间，应当在鉴权处就被拒绝。
func TestProjectDetailRejectsNonMemberTenantHeader(t *testing.T) {
	env := newTenantRoutesEnv(t)
	RegisterProjectRoutes(env.router.Group("/api"), env.svc)

	project, err := env.svc.CreateProject(env.owner, app.CreateProjectRequest{Name: "个人项目"})
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := env.repo.CreateTeamTenant("stranger", "别家团队")
	if err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/projects/"+project.ID, nil)
	request.Header.Set("X-Tenant-Id", foreign.ID)
	env.router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("non-member tenant status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}
