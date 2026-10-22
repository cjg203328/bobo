package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"huabu/backend/internal/app"
	"huabu/backend/internal/database"
	"huabu/backend/internal/remoteauth"
	"huabu/backend/internal/repository"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type trialAccount struct {
	cookie string
	csrf   string
	userID string
}

func TestRemoteTrialAccountCanvasAndResourceRecovery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:remote-trial-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.MigrateCloudSchema(db); err != nil {
		t.Fatal(err)
	}
	dataDir := t.TempDir()
	svc := app.New(repository.New(db), dataDir)
	t.Cleanup(func() {
		_ = svc.Close()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	router := gin.New()
	RegisterRemoteTrialRoutes(router.Group("/api"), svc, remoteauth.New(db, 0), false)
	first := registerTrialAccount(t, router, "canvas-owner@example.com")

	bootstrap := performTrialRequest(router, http.MethodGet, "/api/workspace/bootstrap", nil, "", first.cookie, "")
	if bootstrap.Code != http.StatusOK || !strings.Contains(bootstrap.Body.String(), `"profile":"remote"`) || !strings.Contains(bootstrap.Body.String(), `"storageMode":"remote"`) {
		t.Fatalf("remote bootstrap status=%d body=%s", bootstrap.Code, bootstrap.Body.String())
	}
	missingCSRF := performTrialRequest(router, http.MethodPost, "/api/auth/logout", []byte(`{}`), "application/json", first.cookie, "")
	if missingCSRF.Code != http.StatusForbidden {
		t.Fatalf("logout without CSRF status=%d body=%s", missingCSRF.Code, missingCSRF.Body.String())
	}
	missingCommitCSRF := performTrialRequest(router, http.MethodPost, "/api/canvas-projects/canvas-owner/document-commit", []byte(`{"opId":"missing-csrf","params":{"canvasId":"canvas-owner","expectedRevision":0,"document":{"title":"must be rejected","nodes":[],"connections":[]}}}`), "application/json", first.cookie, "")
	if missingCommitCSRF.Code != http.StatusForbidden {
		t.Fatalf("document commit without CSRF status=%d body=%s", missingCommitCSRF.Code, missingCommitCSRF.Body.String())
	}

	resourceID := uploadTrialResource(t, router, first)
	canvasBody := []byte(`{"project":{"id":"canvas-owner","revision":0,"title":"远端画布","nodes":[],"connections":[]}}`)
	saved := performTrialRequest(router, http.MethodPut, "/api/canvas-projects/canvas-owner", canvasBody, "application/json", first.cookie, first.csrf)
	if saved.Code != http.StatusOK {
		t.Fatalf("save canvas status=%d body=%s", saved.Code, saved.Body.String())
	}

	// A new browser session for the same account must recover the canonical
	// server project and media, independent of the first session's client state.
	reopened := loginTrialAccount(t, router, "canvas-owner@example.com")
	reopened.csrf = refreshTrialCSRF(t, router, reopened.cookie)
	projectList := performTrialRequest(router, http.MethodGet, "/api/canvas-projects?page=1&pageSize=40", nil, "", reopened.cookie, "")
	if projectList.Code != http.StatusOK || !strings.Contains(projectList.Body.String(), `"id":"canvas-owner"`) {
		t.Fatalf("reopened canvas list status=%d body=%s", projectList.Code, projectList.Body.String())
	}
	canvas := performTrialRequest(router, http.MethodGet, "/api/canvas-projects/canvas-owner", nil, "", reopened.cookie, "")
	if canvas.Code != http.StatusOK || !strings.Contains(canvas.Body.String(), `"title":"远端画布"`) {
		t.Fatalf("reopened canvas status=%d body=%s", canvas.Code, canvas.Body.String())
	}
	media := performTrialRequest(router, http.MethodGet, "/api/resources/"+resourceID+"/file", nil, "", reopened.cookie, "")
	if media.Code != http.StatusOK || media.Body.String() != "remote asset recovery" {
		t.Fatalf("reopened resource status=%d body=%q", media.Code, media.Body.String())
	}

	other := registerTrialAccount(t, router, "another-user@example.com")
	foreignWrite := performTrialRequest(router, http.MethodPut, "/api/canvas-projects/canvas-owner", []byte(`{"project":{"id":"canvas-owner","revision":1,"title":"foreign overwrite","nodes":[],"connections":[]}}`), "application/json", other.cookie, other.csrf)
	if foreignWrite.Code == http.StatusOK {
		t.Fatalf("cross-account canvas write succeeded: %s", foreignWrite.Body.String())
	}
	ownerCanvas := performTrialRequest(router, http.MethodGet, "/api/canvas-projects/canvas-owner", nil, "", reopened.cookie, "")
	if ownerCanvas.Code != http.StatusOK || !strings.Contains(ownerCanvas.Body.String(), `"title":"远端画布"`) {
		t.Fatalf("cross-account write changed owner canvas status=%d body=%s", ownerCanvas.Code, ownerCanvas.Body.String())
	}
	for _, path := range []string{"/api/canvas-projects/canvas-owner", "/api/resources/" + resourceID} {
		response := performTrialRequest(router, http.MethodGet, path, nil, "", other.cookie, "")
		if response.Code != http.StatusNotFound {
			t.Fatalf("cross-account read %s status=%d body=%s, want 404", path, response.Code, response.Body.String())
		}
	}

	commitPath := "/api/canvas-projects/canvas-owner/document-commit"
	commitBody := []byte(`{"opId":"remote-save-2","params":{"canvasId":"canvas-owner","expectedRevision":1,"document":{"title":"second revision","nodes":[],"connections":[]}}}`)
	committed := performTrialRequest(router, http.MethodPost, commitPath, commitBody, "application/json", reopened.cookie, reopened.csrf)
	if committed.Code != http.StatusOK || !strings.Contains(committed.Body.String(), `"revision":2`) {
		t.Fatalf("remote document commit status=%d body=%s", committed.Code, committed.Body.String())
	}
	replayed := performTrialRequest(router, http.MethodPost, commitPath, commitBody, "application/json", reopened.cookie, reopened.csrf)
	if replayed.Code != http.StatusOK || !strings.Contains(replayed.Body.String(), `"replayed":true`) {
		t.Fatalf("remote document commit replay status=%d body=%s", replayed.Code, replayed.Body.String())
	}
	staleBody := []byte(`{"opId":"remote-stale-save","params":{"canvasId":"canvas-owner","expectedRevision":1,"document":{"title":"stale overwrite","nodes":[],"connections":[]}}}`)
	stale := performTrialRequest(router, http.MethodPost, commitPath, staleBody, "application/json", reopened.cookie, reopened.csrf)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale remote document commit status=%d body=%s", stale.Code, stale.Body.String())
	}

	recovered := loginTrialAccount(t, router, "canvas-owner@example.com")
	projectAfterCommit := performTrialRequest(router, http.MethodGet, "/api/canvas-projects/canvas-owner", nil, "", recovered.cookie, "")
	if projectAfterCommit.Code != http.StatusOK || !strings.Contains(projectAfterCommit.Body.String(), `"title":"second revision"`) || !strings.Contains(projectAfterCommit.Body.String(), `"revision":2`) {
		t.Fatalf("second-session recovery status=%d body=%s", projectAfterCommit.Code, projectAfterCommit.Body.String())
	}
	foreignCommit := performTrialRequest(router, http.MethodPost, commitPath, []byte(`{"opId":"foreign-save","params":{"canvasId":"canvas-owner","expectedRevision":2,"document":{"title":"foreign commit","nodes":[],"connections":[]}}}`), "application/json", other.cookie, other.csrf)
	if foreignCommit.Code == http.StatusOK {
		t.Fatalf("cross-account document commit succeeded: %s", foreignCommit.Body.String())
	}
	ownerAfterForeignCommit := performTrialRequest(router, http.MethodGet, "/api/canvas-projects/canvas-owner", nil, "", recovered.cookie, "")
	if ownerAfterForeignCommit.Code != http.StatusOK || !strings.Contains(ownerAfterForeignCommit.Body.String(), `"title":"second revision"`) {
		t.Fatalf("cross-account document commit changed owner canvas status=%d body=%s", ownerAfterForeignCommit.Code, ownerAfterForeignCommit.Body.String())
	}
	logout := performTrialRequest(router, http.MethodPost, "/api/auth/logout", []byte(`{}`), "application/json", reopened.cookie, reopened.csrf)
	if logout.Code != http.StatusOK {
		t.Fatalf("logout status=%d body=%s", logout.Code, logout.Body.String())
	}
	revoked := performTrialRequest(router, http.MethodGet, "/api/workspace/bootstrap", nil, "", reopened.cookie, "")
	if revoked.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session status=%d body=%s", revoked.Code, revoked.Body.String())
	}
}

func refreshTrialCSRF(t *testing.T, router http.Handler, cookie string) string {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	request.AddCookie(&http.Cookie{Name: remoteSessionCookie, Value: cookie})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("session restore status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Data struct {
			Authenticated bool   `json:"authenticated"`
			CSRFToken     string `json:"csrfToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	csrfCookie := ""
	for _, item := range response.Result().Cookies() {
		if item.Name == remoteCSRFCookie {
			csrfCookie = item.Value
		}
	}
	if !envelope.Data.Authenticated || envelope.Data.CSRFToken == "" || envelope.Data.CSRFToken != csrfCookie {
		t.Fatalf("session restore returned csrf=%q cookie=%q authenticated=%v", envelope.Data.CSRFToken, csrfCookie, envelope.Data.Authenticated)
	}
	return envelope.Data.CSRFToken
}

func registerTrialAccount(t *testing.T, router http.Handler, email string) trialAccount {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "displayName": "画布用户", "password": "remote-trial-password"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)
	return decodeTrialAccount(t, response)
}

func loginTrialAccount(t *testing.T, router http.Handler, email string) trialAccount {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": "remote-trial-password"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)
	return decodeTrialAccount(t, response)
}

func decodeTrialAccount(t *testing.T, response *httptest.ResponseRecorder) trialAccount {
	t.Helper()
	if response.Code != http.StatusOK {
		t.Fatalf("auth status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Data struct {
			User struct {
				ID string `json:"id"`
			} `json:"user"`
			CSRFToken string `json:"csrfToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	var cookie string
	for _, item := range response.Result().Cookies() {
		if item.Name == remoteSessionCookie {
			cookie = item.Value
		}
	}
	if cookie == "" || envelope.Data.User.ID == "" || envelope.Data.CSRFToken == "" {
		t.Fatalf("auth response missing session state: %#v cookie=%q", envelope.Data, cookie)
	}
	return trialAccount{cookie: cookie, csrf: envelope.Data.CSRFToken, userID: envelope.Data.User.ID}
}

func uploadTrialResource(t *testing.T, router http.Handler, account trialAccount) string {
	t.Helper()
	var body bytes.Buffer
	multipartWriter := multipart.NewWriter(&body)
	if err := multipartWriter.WriteField("kind", "file"); err != nil {
		t.Fatal(err)
	}
	file, err := multipartWriter.CreateFormFile("file", "brief.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(file, "remote asset recovery"); err != nil {
		t.Fatal(err)
	}
	if err := multipartWriter.Close(); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/resources", &body)
	request.Header.Set("Content-Type", multipartWriter.FormDataContentType())
	request.Header.Set("X-CSRF-Token", account.csrf)
	request.AddCookie(&http.Cookie{Name: remoteSessionCookie, Value: account.cookie})
	request.AddCookie(&http.Cookie{Name: remoteCSRFCookie, Value: account.csrf})
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("resource upload status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Data struct {
			Resource struct {
				ID     string `json:"id"`
				UserID string `json:"userId"`
				Status string `json:"status"`
			} `json:"resource"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Data.Resource.ID == "" || envelope.Data.Resource.UserID != account.userID || envelope.Data.Resource.Status != "ready" {
		t.Fatalf("uploaded resource = %#v", envelope.Data.Resource)
	}
	return envelope.Data.Resource.ID
}

func performTrialRequest(router http.Handler, method, path string, body []byte, contentType, cookie, csrf string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if csrf != "" {
		request.Header.Set("X-CSRF-Token", csrf)
		request.AddCookie(&http.Cookie{Name: remoteCSRFCookie, Value: csrf})
	}
	if cookie != "" {
		request.AddCookie(&http.Cookie{Name: remoteSessionCookie, Value: cookie})
	}
	router.ServeHTTP(response, request)
	return response
}
