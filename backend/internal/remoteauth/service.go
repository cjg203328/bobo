package remoteauth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"huabu/backend/internal/model"
	"huabu/backend/internal/remoteidentity"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials  = errors.New("email or password is incorrect")
	ErrEmailAlreadyUsed    = errors.New("email is already registered")
	ErrInvalidRegistration = errors.New("registration details are invalid")
	ErrInvalidSession      = errors.New("session is invalid or expired")
	ErrInvalidCSRF         = errors.New("request verification failed")
)

const (
	minimumPasswordBytes = 12
	maximumPasswordBytes = 72
)

type Service struct {
	db  *gorm.DB
	ttl time.Duration
}

type Session struct {
	ID        string
	Token     string
	CSRFToken string
	ExpiresAt time.Time
	User      model.User
}

type Principal struct {
	Session remoteidentity.AuthSession
	User    model.User
}

func New(db *gorm.DB, ttl time.Duration) *Service {
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour
	}
	return &Service{db: db, ttl: ttl}
}

func (s *Service) Register(email, displayName, password string) (*Session, error) {
	email, err := normalizeEmail(email)
	if err != nil || len(password) < minimumPasswordBytes || len(password) > maximumPasswordBytes {
		return nil, ErrInvalidRegistration
	}
	displayName = strings.TrimSpace(displayName)
	if len([]rune(displayName)) > 80 {
		return nil, ErrInvalidRegistration
	}
	if displayName == "" {
		displayName = strings.Split(email, "@")[0]
	}
	if displayName == "" {
		return nil, ErrInvalidRegistration
	}
	var existing model.User
	if err := s.db.Where("email = ? OR username = ?", email, email).First(&existing).Error; err == nil {
		return nil, ErrEmailAlreadyUsed
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	user := model.User{
		ID: uuid.NewString(), Username: email, Email: email, DisplayName: displayName,
		Role: model.UserRoleUser, Status: model.UserStatusActive, CreatedAt: now, UpdatedAt: now,
	}
	tenant := model.Tenant{
		ID: "tn_" + uuid.NewString(), Name: displayName + " 个人空间", Kind: "personal",
		Status: model.TenantStatusActive, OwnerUserID: user.ID, CreatedAt: now, UpdatedAt: now,
	}
	membership := model.TenantMembership{
		TenantID: tenant.ID, UserID: user.ID, Role: model.TenantRoleOwner,
		InvitedBy: user.ID, CreatedAt: now, UpdatedAt: now,
	}
	credential := remoteidentity.AccountCredential{UserID: user.ID, PasswordHash: string(passwordHash), CreatedAt: now, UpdatedAt: now}
	var createdSession *Session
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		if err := tx.Create(&credential).Error; err != nil {
			return err
		}
		if err := tx.Create(&tenant).Error; err != nil {
			return err
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}
		var createErr error
		createdSession, createErr = s.createSessionWithDB(tx, user)
		return createErr
	}); err != nil {
		var duplicate model.User
		if lookupErr := s.db.Where("email = ? OR username = ?", email, email).First(&duplicate).Error; lookupErr == nil {
			return nil, ErrEmailAlreadyUsed
		}
		return nil, err
	}
	return createdSession, nil
}

func (s *Service) Login(email, password string) (*Session, error) {
	email, err := normalizeEmail(email)
	if err != nil || password == "" {
		return nil, ErrInvalidCredentials
	}
	var user model.User
	if err := s.db.Where("email = ? AND status = ?", email, model.UserStatusActive).First(&user).Error; err != nil {
		return nil, ErrInvalidCredentials
	}
	var credential remoteidentity.AccountCredential
	if err := s.db.First(&credential, "user_id = ?", user.ID).Error; err != nil || bcrypt.CompareHashAndPassword([]byte(credential.PasswordHash), []byte(password)) != nil {
		return nil, ErrInvalidCredentials
	}
	return s.createSession(user)
}

func (s *Service) Authenticate(token string) (*Principal, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrInvalidSession
	}
	var session remoteidentity.AuthSession
	if err := s.db.Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", digest(token), time.Now().UTC()).First(&session).Error; err != nil {
		return nil, ErrInvalidSession
	}
	var user model.User
	if err := s.db.Where("id = ? AND status = ?", session.UserID, model.UserStatusActive).First(&user).Error; err != nil {
		return nil, ErrInvalidSession
	}
	return &Principal{Session: session, User: user}, nil
}

func (s *Service) ValidateCSRF(sessionID, token string) error {
	if strings.TrimSpace(token) == "" {
		return ErrInvalidCSRF
	}
	var session remoteidentity.AuthSession
	if err := s.db.Select("csrf_hash").First(&session, "id = ? AND revoked_at IS NULL AND expires_at > ?", sessionID, time.Now().UTC()).Error; err != nil {
		return ErrInvalidSession
	}
	if subtle.ConstantTimeCompare([]byte(session.CSRFHash), []byte(digest(token))) != 1 {
		return ErrInvalidCSRF
	}
	return nil
}

func (s *Service) RotateCSRF(sessionID string) (string, error) {
	token, err := randomToken(32)
	if err != nil {
		return "", err
	}
	result := s.db.Model(&remoteidentity.AuthSession{}).Where("id = ? AND revoked_at IS NULL AND expires_at > ?", sessionID, time.Now().UTC()).Update("csrf_hash", digest(token))
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected != 1 {
		return "", ErrInvalidSession
	}
	return token, nil
}

func (s *Service) Revoke(sessionID string) error {
	now := time.Now().UTC()
	return s.db.Model(&remoteidentity.AuthSession{}).Where("id = ? AND revoked_at IS NULL", sessionID).Update("revoked_at", now).Error
}

func (s *Service) createSession(user model.User) (*Session, error) {
	return s.createSessionWithDB(s.db, user)
}

func (s *Service) createSessionWithDB(db *gorm.DB, user model.User) (*Session, error) {
	token, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	csrf, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	expiresAt := time.Now().UTC().Add(s.ttl)
	value := remoteidentity.AuthSession{
		ID: uuid.NewString(), UserID: user.ID, TokenHash: digest(token), CSRFHash: digest(csrf),
		ExpiresAt: expiresAt, CreatedAt: time.Now().UTC(),
	}
	if err := db.Create(&value).Error; err != nil {
		return nil, err
	}
	return &Session{ID: value.ID, Token: token, CSRFToken: csrf, ExpiresAt: expiresAt, User: user}, nil
}

func normalizeEmail(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if len(value) > 320 || value == "" {
		return "", ErrInvalidRegistration
	}
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value || !strings.Contains(value, "@") {
		return "", ErrInvalidRegistration
	}
	return value, nil
}

func randomToken(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("create session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
