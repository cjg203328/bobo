package remoteauth

import (
	"errors"
	"testing"
	"time"

	"huabu/backend/internal/model"
	"huabu/backend/internal/remoteidentity"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRegisterLoginAndTenantSessionLifecycle(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:remote-auth-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &remoteidentity.AccountCredential{}, &remoteidentity.AuthSession{}, &model.Tenant{}, &model.TenantMembership{}); err != nil {
		t.Fatal(err)
	}
	service := New(db, time.Hour)
	created, err := service.Register("User@Example.com", "波波用户", "a-long-trial-password")
	if err != nil {
		t.Fatal(err)
	}
	if created.User.Email != "user@example.com" || created.User.Username != created.User.Email {
		t.Fatalf("normalized account = %#v", created.User)
	}
	if created.Token == "" || created.CSRFToken == "" || created.Token == created.CSRFToken {
		t.Fatal("session and CSRF tokens must be independent nonempty values")
	}
	var credential remoteidentity.AccountCredential
	if err := db.First(&credential, "user_id = ?", created.User.ID).Error; err != nil {
		t.Fatal(err)
	}
	if credential.PasswordHash == "a-long-trial-password" {
		t.Fatal("password was stored in cleartext")
	}
	var tenant model.Tenant
	if err := db.First(&tenant, "owner_user_id = ?", created.User.ID).Error; err != nil {
		t.Fatal(err)
	}
	var membership model.TenantMembership
	if err := db.First(&membership, "tenant_id = ? AND user_id = ?", tenant.ID, created.User.ID).Error; err != nil {
		t.Fatal(err)
	}
	if membership.Role != model.TenantRoleOwner {
		t.Fatalf("personal tenant membership role = %q", membership.Role)
	}

	principal, err := service.Authenticate(created.Token)
	if err != nil || principal.User.ID != created.User.ID {
		t.Fatalf("authenticate = %#v, %v", principal, err)
	}
	if err := service.ValidateCSRF(principal.Session.ID, created.CSRFToken); err != nil {
		t.Fatalf("valid CSRF token rejected: %v", err)
	}
	if err := service.ValidateCSRF(principal.Session.ID, "wrong-token"); !errors.Is(err, ErrInvalidCSRF) {
		t.Fatalf("invalid CSRF error = %v", err)
	}

	loggedIn, err := service.Login("USER@example.com", "a-long-trial-password")
	if err != nil || loggedIn.User.ID != created.User.ID {
		t.Fatalf("login = %#v, %v", loggedIn, err)
	}
	if _, err := service.Login("user@example.com", "wrong-password"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password error = %v", err)
	}
	if _, err := service.Register("user@example.com", "Another", "another-long-password"); !errors.Is(err, ErrEmailAlreadyUsed) {
		t.Fatalf("duplicate registration error = %v", err)
	}
	if err := service.Revoke(principal.Session.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Authenticate(created.Token); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("revoked session error = %v", err)
	}
}

func TestRegisterRejectsWeakOrInvalidCredentials(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:remote-auth-validation?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &remoteidentity.AccountCredential{}, &remoteidentity.AuthSession{}, &model.Tenant{}, &model.TenantMembership{}); err != nil {
		t.Fatal(err)
	}
	service := New(db, time.Hour)
	for _, item := range []struct{ email, password string }{
		{"not-an-email", "a-long-trial-password"},
		{"person@example.com", "short"},
		{"person@example.com", string(make([]byte, 73))},
	} {
		if _, err := service.Register(item.email, "Person", item.password); !errors.Is(err, ErrInvalidRegistration) {
			t.Fatalf("register(%q, password length %d) error = %v", item.email, len(item.password), err)
		}
	}
}
