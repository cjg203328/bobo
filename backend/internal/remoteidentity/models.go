package remoteidentity

import "time"

type AccountCredential struct {
	UserID       string    `json:"userId" gorm:"primaryKey;size:36"`
	PasswordHash string    `json:"-" gorm:"type:text;not null"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type AuthSession struct {
	ID        string     `json:"id" gorm:"primaryKey;size:36"`
	UserID    string     `json:"userId" gorm:"index;size:36;not null"`
	TokenHash string     `json:"-" gorm:"size:64;uniqueIndex;not null"`
	CSRFHash  string     `json:"-" gorm:"size:64;not null"`
	ExpiresAt time.Time  `json:"expiresAt" gorm:"index;not null"`
	RevokedAt *time.Time `json:"revokedAt,omitempty" gorm:"index"`
	CreatedAt time.Time  `json:"createdAt"`
}

func (AccountCredential) TableName() string { return "account_credentials" }

func (AuthSession) TableName() string { return "auth_sessions" }
