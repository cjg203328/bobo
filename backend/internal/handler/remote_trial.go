package handler

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"huabu/backend/internal/agentops"
	"huabu/backend/internal/app"
	"huabu/backend/internal/remoteauth"
	"huabu/backend/internal/repository"

	"github.com/gin-gonic/gin"
)

const (
	remotePrincipalKey  = "canvas.remote-principal"
	remoteSessionCookie = "bobo_session"
	remoteCSRFCookie    = "bobo_csrf"
)

func RegisterRemoteTrialRoutes(api *gin.RouterGroup, svc *app.Service, auth *remoteauth.Service, cookieSecure bool) {
	publicAuth := api.Group("")
	publicAuth.Use(RuntimeDependenciesMiddleware(defaultRuntimeDependencies(svc)))
	publicAuth.POST("/auth/register", func(c *gin.Context) {
		if !enforceRateLimit(c, "remote-auth-register:"+c.ClientIP(), 5, time.Minute) {
			return
		}
		var req struct {
			Email       string `json:"email"`
			DisplayName string `json:"displayName"`
			Password    string `json:"password"`
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		session, err := auth.Register(req.Email, req.DisplayName, req.Password)
		if err != nil {
			switch {
			case errors.Is(err, remoteauth.ErrEmailAlreadyUsed):
				fail(c, http.StatusConflict, err)
			case errors.Is(err, remoteauth.ErrInvalidRegistration):
				fail(c, http.StatusBadRequest, err)
			default:
				failService(c, err)
			}
			return
		}
		setRemoteSessionCookie(c, session.Token, session.ExpiresAt, cookieSecure)
		setRemoteCSRFCookie(c, session.CSRFToken, session.ExpiresAt, cookieSecure)
		ok(c, gin.H{"user": session.User, "csrfToken": session.CSRFToken})
	})
	publicAuth.POST("/auth/login", func(c *gin.Context) {
		if !enforceRateLimit(c, "remote-auth-login:"+c.ClientIP(), 10, time.Minute) {
			return
		}
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		session, err := auth.Login(req.Email, req.Password)
		if err != nil {
			if errors.Is(err, remoteauth.ErrInvalidCredentials) {
				fail(c, http.StatusUnauthorized, err)
				return
			}
			failService(c, err)
			return
		}
		setRemoteSessionCookie(c, session.Token, session.ExpiresAt, cookieSecure)
		setRemoteCSRFCookie(c, session.CSRFToken, session.ExpiresAt, cookieSecure)
		ok(c, gin.H{"user": session.User, "csrfToken": session.CSRFToken})
	})
	publicAuth.GET("/auth/session", func(c *gin.Context) {
		token, err := remoteSessionToken(c)
		if err != nil {
			ok(c, gin.H{"authenticated": false, "user": nil})
			return
		}
		principal, err := auth.Authenticate(token)
		if err != nil {
			clearRemoteSessionCookie(c, cookieSecure)
			ok(c, gin.H{"authenticated": false, "user": nil})
			return
		}
		csrfToken, csrfErr := authCSRFForResponse(auth, principal.Session.ID, principal.Session.ExpiresAt, c, cookieSecure)
		if csrfErr != nil {
			failService(c, csrfErr)
			return
		}
		ok(c, gin.H{"authenticated": true, "user": principal.User, "csrfToken": csrfToken})
	})

	private := api.Group("")
	private.Use(RuntimeDependenciesMiddleware(defaultRuntimeDependencies(svc)))
	private.Use(RemoteAccountMiddleware(auth, cookieSecure))
	private.POST("/auth/logout", func(c *gin.Context) {
		principal := RemotePrincipal(c)
		if principal == nil {
			fail(c, http.StatusUnauthorized, remoteauth.ErrInvalidSession)
			return
		}
		if err := auth.Revoke(principal.Session.ID); err != nil {
			failService(c, err)
			return
		}
		clearRemoteSessionCookie(c, cookieSecure)
		ok(c, gin.H{"ok": true})
	})
	private.GET("/workspace/bootstrap", func(c *gin.Context) {
		principal := RemotePrincipal(c)
		if principal == nil {
			fail(c, http.StatusUnauthorized, remoteauth.ErrInvalidSession)
			return
		}
		repo := repository.New(svc.Database())
		memberships, err := repo.MembershipsByUser(principal.User.ID)
		if err != nil || len(memberships) == 0 {
			failService(c, errors.Join(err, errors.New("personal workspace is missing")))
			return
		}
		tenant, err := repo.Tenant(memberships[0].TenantID)
		if err != nil {
			failService(c, err)
			return
		}
		limits, err := svc.PublicRuntimeLimits()
		if err != nil {
			failService(c, err)
			return
		}
		features, err := svc.FeatureAvailability()
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{
			"contractVersion": 1,
			"profile":         "remote",
			"capabilities":    gin.H{"localAssets": false, "providerCalls": false, "auth": true, "cloudStorage": true, "remoteSync": true},
			"workspace":       gin.H{"id": tenant.ID, "name": tenant.Name, "owner": "personal", "storage": "server"},
			"user":            principal.User,
			"storageMode":     "remote",
			"runtimeLimits":   limits,
			"features":        features,
		})
	})
	RegisterUserDataRoutes(private, svc)
	RegisterChunkedUploadRoutes(private, svc, true)
	operations := agentops.NewRegistry(svc, agentops.NewStore(svc.Database()))
	agentops.RegisterDefaultOps(operations)
	RegisterRemoteCanvasDocumentCommitRoutes(private, svc, operations)
}

func RemoteAccountMiddleware(auth *remoteauth.Service, cookieSecure bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := remoteSessionToken(c)
		if err != nil {
			fail(c, http.StatusUnauthorized, remoteauth.ErrInvalidSession)
			c.Abort()
			return
		}
		principal, err := auth.Authenticate(token)
		if err != nil {
			clearRemoteSessionCookie(c, cookieSecure)
			fail(c, http.StatusUnauthorized, remoteauth.ErrInvalidSession)
			c.Abort()
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead && c.Request.Method != http.MethodOptions {
			csrfToken := c.GetHeader("X-CSRF-Token")
			csrfCookie, csrfCookieErr := c.Cookie(remoteCSRFCookie)
			if csrfCookieErr != nil || csrfToken == "" || subtle.ConstantTimeCompare([]byte(csrfToken), []byte(csrfCookie)) != 1 {
				fail(c, http.StatusForbidden, remoteauth.ErrInvalidCSRF)
				c.Abort()
				return
			}
			if err := auth.ValidateCSRF(principal.Session.ID, csrfToken); err != nil {
				fail(c, http.StatusForbidden, err)
				c.Abort()
				return
			}
		}
		c.Set(remotePrincipalKey, principal)
		c.Next()
	}
}

func RemotePrincipal(c *gin.Context) *remoteauth.Principal {
	value, exists := c.Get(remotePrincipalKey)
	if !exists {
		return nil
	}
	principal, _ := value.(*remoteauth.Principal)
	return principal
}

func remoteSessionToken(c *gin.Context) (string, error) {
	cookie, err := c.Cookie(remoteSessionCookie)
	if err != nil || strings.TrimSpace(cookie) == "" {
		return "", remoteauth.ErrInvalidSession
	}
	return cookie, nil
}

func setRemoteSessionCookie(c *gin.Context, token string, expiresAt time.Time, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	if secure {
		c.SetSameSite(http.SameSiteNoneMode)
	}
	maxAge := int(time.Until(expiresAt).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}
	c.SetCookie(remoteSessionCookie, token, maxAge, "/api", "", secure, true)
}

func setRemoteCSRFCookie(c *gin.Context, token string, expiresAt time.Time, secure bool) {
	maxAge := int(time.Until(expiresAt).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}
	c.SetCookie(remoteCSRFCookie, token, maxAge, "/api", "", secure, false)
}

func authCSRFForResponse(auth *remoteauth.Service, sessionID string, expiresAt time.Time, c *gin.Context, secure bool) (string, error) {
	if token, err := c.Cookie(remoteCSRFCookie); err == nil && auth.ValidateCSRF(sessionID, token) == nil {
		return token, nil
	}
	token, err := auth.RotateCSRF(sessionID)
	if err != nil {
		return "", err
	}
	setRemoteCSRFCookie(c, token, expiresAt, secure)
	return token, nil
}

func clearRemoteSessionCookie(c *gin.Context, secure bool) {
	c.SetSameSite(http.SameSiteLaxMode)
	if secure {
		c.SetSameSite(http.SameSiteNoneMode)
	}
	c.SetCookie(remoteSessionCookie, "", -1, "/api", "", secure, true)
	c.SetCookie(remoteCSRFCookie, "", -1, "/api", "", secure, false)
}
