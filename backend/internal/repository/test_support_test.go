package repository

import (
	"testing"

	"gorm.io/gorm"
)

func closeTestDBOnCleanup(t *testing.T, db *gorm.DB) {
	t.Helper()
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
}
