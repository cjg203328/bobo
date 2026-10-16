package canvas

import (
	"encoding/json"

	"huabu/backend/internal/asset"
)

func validateUserAssetDocument(raw json.RawMessage) error {
	return asset.ValidateDocument(raw)
}
