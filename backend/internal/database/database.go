package database

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type Config struct {
	Driver  string
	DSN     string
	DataDir string
}

type DriverOpener func(string) gorm.Dialector

var (
	driverOpenersMu sync.RWMutex
	driverOpeners   = map[string]DriverOpener{"sqlite": sqlite.Open}
)

func RegisterDriver(name string, opener DriverOpener) error {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" || opener == nil {
		return fmt.Errorf("database driver name and opener are required")
	}
	driverOpenersMu.Lock()
	defer driverOpenersMu.Unlock()
	if _, ok := driverOpeners[name]; ok {
		return fmt.Errorf("database driver %q is already registered", name)
	}
	driverOpeners[name] = opener
	return nil
}

func registeredDriver(name string) (DriverOpener, bool) {
	driverOpenersMu.RLock()
	defer driverOpenersMu.RUnlock()
	opener, ok := driverOpeners[name]
	return opener, ok
}

func Open(config Config) (*gorm.DB, error) {
	driver := strings.ToLower(strings.TrimSpace(config.Driver))
	if driver == "" {
		driver = "sqlite"
	}
	switch driver {
	case "sqlite":
		dsn := strings.TrimSpace(config.DSN)
		if dsn == "" {
			if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
				return nil, err
			}
			dsn = config.DataDir + "/open_ai_canvas.db?_busy_timeout=5000&_journal_mode=WAL&_foreign_keys=on&_synchronous=NORMAL"
		}
		return gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	case "postgres", "postgresql":
		dsn := strings.TrimSpace(config.DSN)
		if dsn == "" {
			return nil, fmt.Errorf("DATABASE_URL is required when database driver is %s", driver)
		}
		opener, ok := registeredDriver(driver)
		if !ok {
			return nil, fmt.Errorf("postgres database driver is not linked into this binary")
		}
		return gorm.Open(opener(dsn), &gorm.Config{})
	default:
		return nil, fmt.Errorf("不支持的数据库驱动：%s", driver)
	}
}

func ConfigurePool(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	switch db.Dialector.Name() {
	case "sqlite":
		// SQLite serializes writers. A single shared connection avoids intermittent
		// SQLITE_BUSY failures under concurrent autosave/task updates while WAL
		// still keeps reads cheap for this single-process desktop application.
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetMaxIdleConns(1)
	case "postgres":
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(30 * time.Minute)
		sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	default:
		return fmt.Errorf("unsupported database dialect: %s", db.Dialector.Name())
	}
	return nil
}
