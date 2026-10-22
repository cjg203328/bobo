package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"huabu/backend/internal/agentops"
	"huabu/backend/internal/app"
)

// RegisterRemoteCanvasDocumentCommitRoutes must be mounted behind remote
// account and CSRF middleware. It intentionally does not expose local /ops
// routes or rely on loopback and desktop trust checks.
func RegisterRemoteCanvasDocumentCommitRoutes(r gin.IRouter, svc *app.Service, operations *agentops.Registry) {
	r.POST("/canvas-projects/:id/document-commit", func(c *gin.Context) {
		if RemotePrincipal(c) == nil {
			fail(c, http.StatusUnauthorized, app.Forbidden("sign in to save this canvas"))
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
			fail(c, http.StatusBadRequest, app.BadAuthRequest("invalid canvas save request or request exceeds 5 MB"))
			return
		}
		if req.Params.CanvasID != c.Param("id") || strings.TrimSpace(req.OpID) == "" || req.Params.ExpectedRevision == nil {
			fail(c, http.StatusBadRequest, app.BadAuthRequest("canvas id, operation id, and expected revision are required"))
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
