package database

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMigrateCloudSchemaIncludesIdentityCanvasAndResourceTables(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:cloud-schema-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateCloudSchema(db); err != nil {
		t.Fatal(err)
	}
	status, err := ReadCloudSchemaStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if !status.Ready || status.Current != CloudSchemaVersion || status.Expected != CloudSchemaVersion {
		t.Fatalf("cloud schema status = %#v", status)
	}
	if err := MigrateCloudSchema(db); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
}

func TestOpenRejectsPostgresWithoutURL(t *testing.T) {
	if _, err := Open(Config{Driver: "postgres"}); err == nil {
		t.Fatal("postgres driver without DATABASE_URL should fail before starting")
	}
}

func TestOpenRequiresPostgresDriverToBeLinkedIntoServerBinary(t *testing.T) {
	if _, err := Open(Config{Driver: "postgres", DSN: "postgres://localhost/bobo"}); err == nil {
		t.Fatal("desktop-compatible database package must not load PostgreSQL without server registration")
	}
}
