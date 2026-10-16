package canvas

import (
	"encoding/json"

	"huabu/backend/internal/asset"
	"huabu/backend/internal/model"
)

func ClientAssetPayload(item model.Asset) json.RawMessage {
	return asset.ClientAssetPayload(item)
}
