package model

import "time"

type User struct {
	ID          string     `json:"id" gorm:"primaryKey;size:36"`
	Username    string     `json:"username" gorm:"size:80;uniqueIndex:idx_users_username"`
	Email       string     `json:"email,omitempty" gorm:"size:320;uniqueIndex:idx_users_email"`
	DisplayName string     `json:"displayName" gorm:"size:80"`
	Role        UserRole   `json:"role" gorm:"size:24"`
	Status      UserStatus `json:"status" gorm:"size:24"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}
