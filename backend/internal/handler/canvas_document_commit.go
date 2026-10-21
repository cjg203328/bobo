package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"huabu/backend/internal/agentops"
	"huabu/backend/internal/app"
)

// The local editor uses the workspace write principal, while /ops keeps its
// separate owner/client identity contract. Both paths share CAS and receipts.
func RegisterCanvasDocumentCommitRoutes(r gin.IRouter, svc *app.Service, operations *agentops.Registry) {
	r.POST("/canvas-projects/:id/document-commit", func(c *gin.Context) {
		if !isLoopbackRequest(c.Request) || strings.TrimSpace(c.GetHeader("X-Huabu-Client")) != "" || isAssistantHostRequest(c, svc) {
			fail(c, http.StatusForbidden, app.Forbidden("画布整页保存只能由本机工作区界面完成"))
			return
		}
		if !requireTrustedDesktopWritePrincipal(c, "画布保存需要受信任的桌面界面") {
			return
		}
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, agentOpsMaxBody)
		var req struct {
			OpID   string `json:"opId"`
			Params struct {
				CanvasID         string          `json:"canvasId"`
				ExpectedRevision *int64          `json:"expectedRevision"`
				Document         json.RawMessage `json:"document"`
			} `json:"params"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, app.BadAuthRequest("画布保存请求无效或超过 5MB 限制"))
			return
		}
		if req.Params.CanvasID != c.Param("id") || strings.TrimSpace(req.OpID) == "" || req.Params.ExpectedRevision == nil {
			fail(c, http.StatusBadRequest, app.BadAuthRequest("画布 ID、操作 ID 和期望版本必须完整且一致"))
			return
		}
		params, err := json.Marshal(req.Params)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		result, err := operations.Execute(agentops.Request{
			Context: c.Request.Context(), UserID: user.ID,
			Op: "canvas.document.commit", OpID: req.OpID, Params: params,
			Caller: agentops.Caller{Kind: agentops.CallerManual},
		})
		if err != nil {
			opErr := agentops.AsError(err)
			c.JSON(agentops.HTTPStatus(opErr.Code), gin.H{"code": agentops.HTTPStatus(opErr.Code), "reason": opErr.Reason, "msg": opErr.Message, "details": opErr.Details})
			return
		}
		ok(c, result)
	})
}
