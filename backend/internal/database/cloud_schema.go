package database

import (
	"fmt"

	"huabu/backend/internal/model"
	"huabu/backend/internal/remoteidentity"

	"gorm.io/gorm"
)

const CloudSchemaVersion int64 = 1

// MigrateCloudSchema builds the current server schema on a fresh remote database.
// Local SQLite keeps its versioned, preservation-focused migration path.
func MigrateCloudSchema(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("cloud database is not initialized")
	}
	models := append(LocalModels(), &model.User{}, &remoteidentity.AccountCredential{}, &remoteidentity.AuthSession{})
	if err := db.AutoMigrate(models...); err != nil {
		return fmt.Errorf("migrate cloud schema: %w", err)
	}
	return RequireCloudSchema(db)
}

func RequireCloudSchema(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("cloud database is not initialized")
	}
	for _, value := range []any{
		&model.User{}, &remoteidentity.AccountCredential{}, &remoteidentity.AuthSession{},
		&model.Tenant{}, &model.TenantMembership{}, &model.CanvasProject{},
		&model.CanvasSnapshot{}, &model.CanvasSnapshotResource{}, &model.Resource{},
	} {
		if !db.Migrator().HasTable(value) {
			return fmt.Errorf("cloud schema is missing table for %T", value)
		}
	}
	return nil
}

func ReadCloudSchemaStatus(db *gorm.DB) (SchemaStatus, error) {
	status := SchemaStatus{Expected: CloudSchemaVersion}
	if err := RequireCloudSchema(db); err != nil {
		return status, nil
	}
	status.Current = CloudSchemaVersion
	status.Ready = true
	return status, nil
}
