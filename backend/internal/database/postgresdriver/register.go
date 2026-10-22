package postgresdriver

import (
	"huabu/backend/internal/database"

	"gorm.io/driver/postgres"
)

func init() {
	if err := database.RegisterDriver("postgres", postgres.Open); err != nil {
		panic(err)
	}
	if err := database.RegisterDriver("postgresql", postgres.Open); err != nil {
		panic(err)
	}
}
