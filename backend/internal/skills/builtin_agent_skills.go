package skills

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"huabu/backend/internal/kernel"
)

type builtinAgentSkillDefinition struct {
	id          string
	name        string
	description string
	instruction string
	version     string
	versionID   string
	contentHash string
}

// These product skills ship with the Agent runtime. They are not marketplace
// records and cannot be published, removed, or edited by workspace users.
func boboBuiltinAgentSkills() []builtinAgentSkillDefinition {
	definitions := []builtinAgentSkillDefinition{
		{
			id:          "bobo-prompt-reverse",
			name:        "图片提示词反推",
			description: "分析参考图片并整理成可编辑的正向提示词和限制词。",
			version:     "1.0.0",
			instruction: `# 图片提示词反推

1. 确认当前对话或画布中有可读取的图片。没有图片时先请用户添加，不推测画面。
2. 只描述实际观察到的内容，并区分画面事实与推断。按主体、构图、色彩、光线、风格、材质整理要点。
3. 输出可直接修改的正向提示词和负向限制词；不确定的信息标为可选，不替用户补造品牌或文字。
4. 将结果写入新的独立文本节点，并在有来源节点时建立引用关系。
5. 只做分析，不启动生图，不覆盖源图或已有提示词。`,
		},
		{
			id:          "bobo-prompt-optimize",
			name:        "提示词优化",
			description: "保留原意，补足画面结构并输出独立的新版本。",
			version:     "1.0.0",
			instruction: `# 提示词优化

1. 找到用户本轮提供、引用或选中的源提示词；缺少源内容时先请用户粘贴或选择文本节点。
2. 保留核心意图、主体和明确约束，不擅自更换主题、品牌、人物或产品特征。
3. 按任务补足主体特征、场景构图、光线、风格、细节、画幅和负向限制；不要写模型不支持的参数。
4. 简要说明主要调整点，并把完整新提示词写入独立文本节点，保留原文。
5. 不自动开始图片或视频生成；需要生成时先展示提案并等待用户确认。`,
		},
		{
			id:          "bobo-image-refine",
			name:        "参考图片细化",
			description: "明确修改范围和模型能力，保留原图后再准备编辑提案。",
			version:     "1.0.0",
			instruction: `# 参考图片细化

1. 确认用户提供或选中的源图片，以及明确的修改目标；缺少任一项时先询问。
2. 复述需要保留的主体和细节，明确全图衍生、局部编辑或细节增强的目标范围。
3. 检查当前模型实际支持的图片输入与编辑能力；不支持的操作要直接说明，不能用裁切、插值或普通生成冒充细化。
4. 保留源图，结果使用新节点；先列出模型、修改目标、输出数量和预计费用。
5. 只有用户明确确认提案后才进入生成流程。`,
		},
	}

	for index := range definitions {
		sum := sha256.Sum256([]byte(definitions[index].instruction))
		definitions[index].contentHash = hex.EncodeToString(sum[:])
		definitions[index].versionID = "bobo-v1-" + definitions[index].contentHash[:12]
	}
	return definitions
}

func builtinAgentSkillItem(definition builtinAgentSkillDefinition) SkillItem {
	createdAt := time.Date(2026, time.October, 21, 0, 0, 0, 0, time.UTC)
	return SkillItem{
		SkillID: definition.id, SkillName: definition.name, Description: definition.description,
		VersionID: definition.versionID, Version: definition.version, ContentHash: definition.contentHash,
		FileCount: 1, TotalBytes: int64(len(definition.instruction)), SourceType: "bobo_builtin", Source: 0,
		Tag: "creative", IsPrivate: true, Status: skillStatusEnabled, IsAdded: true,
		EffectiveUser: SkillEffectiveUser{Name: "波波 AI 画"}, ShowcaseMedia: []SkillShowcaseMedia{},
		CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}

func builtinAgentResource(pin Pin) (*AgentResource, bool, error) {
	for _, definition := range boboBuiltinAgentSkills() {
		if pin.SkillID != definition.id {
			continue
		}
		if err := ValidatePin(pin); err != nil {
			return nil, true, err
		}
		if pin.VersionID != definition.versionID || pin.ContentHash != definition.contentHash {
			return nil, true, kernel.NewAppError(409, "内置技能版本已更新，请重新选择")
		}
		file := SkillPackageFileItem{
			Path: "SKILL.md", Kind: "markdown", MimeType: "text/markdown",
			Size: int64(len(definition.instruction)), SHA256: definition.contentHash,
		}
		return &AgentResource{
			Pin: pin.Identity(), Name: definition.name, Description: definition.description,
			Version: definition.version, Instruction: definition.instruction,
			Files: []SkillPackageFileItem{file}, UnsupportedCapabilities: []string{},
		}, true, nil
	}
	return nil, false, nil
}
