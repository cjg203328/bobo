package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"huabu/backend/internal/agentops"
)

func TestLocalEditorDocumentCommit(t *testing.T) {
	env := newAssistantTestEnv(t, nil)
	router := gin.New()
	router.Use(RuntimeDependenciesMiddleware(RuntimeDependencies{}))
	api := router.Group("/api")
	operations := RegisterAgentOpsRoutes(api, env.service, agentops.NewStore(env.service.Database()), env.clients)
	RegisterCanvasDocumentCommitRoutes(api, env.service, operations)
	call := func(opID string, revision int, headers map[string]string, canvasID string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]any{"opId": opID, "params": map[string]any{
			"canvasId": canvasID, "expectedRevision": revision,
			"document": map[string]any{"title": "Web 保存", "nodes": []any{}, "connections": []any{}},
		}})
		request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:2010/api/canvas-projects/"+env.canvasID+"/document-commit", strings.NewReader(string(body)))
		request.RemoteAddr = "127.0.0.1:12345"
		request.Header.Set("Content-Type", "application/json")
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	first := call("web-save", 1, nil, env.canvasID)
	if first.Code != 200 {
		t.Fatalf("save: %d %s", first.Code, first.Body.String())
	}
	replayed := call("web-save", 1, nil, env.canvasID)
	if replayed.Code != 200 || !strings.Contains(replayed.Body.String(), `"replayed":true`) {
		t.Fatalf("idempotent replay: %d %s", replayed.Code, replayed.Body.String())
	}
	conflict := call("stale-save", 1, nil, env.canvasID)
	if conflict.Code != 409 {
		t.Fatalf("CAS: %d %s", conflict.Code, conflict.Body.String())
	}
	for _, headers := range []map[string]string{
		{"Origin": "http://foreign.example"},
		{"X-Huabu-Client": "external"},
		{"X-Huabu-Agent-Token": assistantTestHostToken},
	} {
		denied := call("denied-save", 2, headers, env.canvasID)
		if denied.Code != 403 {
			t.Fatalf("principal: %d %s", denied.Code, denied.Body.String())
		}
	}
	if mismatch := call("mismatch", 2, nil, "other-canvas"); mismatch.Code != 400 {
		t.Fatalf("ID mismatch: %d %s", mismatch.Code, mismatch.Body.String())
	}
	if code, body := postOps(t, router, "canvas.document.commit", "untrusted-ops", nil, `{}`); code != 403 {
		t.Fatalf("generic ops trust changed: %d %s", code, body)
	}
}

func TestDesktopEditorDocumentCommitRequiresTrust(t *testing.T) {
	env := newAssistantTestEnv(t, nil)
	router := gin.New()
	router.Use(RuntimeDependenciesMiddleware(RuntimeDependencies{DesktopTrust: func(r *http.Request) bool {
		return r.Header.Get("X-Desktop-Token") == "launch" && r.Header.Get("X-Huabu-UI-Bootstrap") == "ui"
	}}))
	api := router.Group("/api")
	operations := RegisterAgentOpsRoutes(api, env.service, agentops.NewStore(env.service.Database()), env.clients)
	RegisterCanvasDocumentCommitRoutes(api, env.service, operations)
	for _, trusted := range []bool{false, true} {
		body := `{"opId":"desktop-editor","params":{"canvasId":"` + env.canvasID + `","expectedRevision":1,"document":{"title":"Desktop","nodes":[],"connections":[]}}}`
		request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:2010/api/canvas-projects/"+env.canvasID+"/document-commit", strings.NewReader(body))
		request.RemoteAddr = "127.0.0.1:12345"
		request.Header.Set("Content-Type", "application/json")
		if trusted {
			request.Header.Set("X-Desktop-Token", "launch")
			request.Header.Set("X-Huabu-UI-Bootstrap", "ui")
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		want := 403
		if trusted {
			want = 200
		}
		if response.Code != want {
			t.Fatalf("trusted=%v: %d %s", trusted, response.Code, response.Body.String())
		}
	}
}
