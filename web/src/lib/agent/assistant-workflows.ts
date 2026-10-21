export const ASSISTANT_WORKFLOW_TEMPLATES = [
    {
        id: "product-visual",
        title: "商品宣传套图",
        summary: "主视觉、卖点图和封面",
        homePrompt: "我想为一个商品制作一套宣传视觉，包含主视觉、卖点图和社媒封面。",
        prompt: [
            "我想为一个商品制作一套宣传视觉。请先了解商品特点、目标人群、发布渠道、品牌风格和需要的产物，只询问缺少且会影响方案的信息，每轮最多问 3 个问题。",
            "信息足够后，请提出清晰的内容与视觉方案，列出产物及规格；结合可用的参考素材和内置技能，把提示词与生成步骤组织到当前画布。任何可能计费的生成都先给我检查并确认，不要声称已经发布内容。",
        ].join("\n\n"),
    },
    {
        id: "social-content",
        title: "社媒图文内容",
        summary: "选题、配图和封面",
        homePrompt: "我想准备一组社交媒体图文内容，包含选题、配图和封面。",
        prompt: [
            "我想准备一组社交媒体图文内容。请先了解发布平台、主题或商品、目标受众、表达口吻和产物规格，只询问缺少且会影响方案的信息，每轮最多问 3 个问题。",
            "信息足够后，请整理内容提纲、配图方向和封面方案；用合适的内置技能完善提示词，并把文案、视觉参考和生成步骤放进当前画布。任何可能计费的生成都先给我检查并确认，不要声称已经发布或带来实际转化。",
        ].join("\n\n"),
    },
    {
        id: "short-video",
        title: "短视频素材方案",
        summary: "脚本、分镜和视频画面",
        homePrompt: "我想把一个创意做成短视频，先准备脚本、分镜和画面方向。",
        prompt: [
            "我想把一个创意做成短视频素材。请先了解主题、发布平台、目标受众、时长和视觉风格，只询问缺少且会影响方案的信息，每轮最多问 3 个问题。",
            "信息足够后，请整理脚本和分镜，再按可用模型能力准备图片或视频生成步骤，把提示词、参考素材和结果组织到当前画布。任何可能计费的生成都先给我检查并确认；如果当前模型不支持所需能力，请说明限制，不要假称视频已生成或发布。",
        ].join("\n\n"),
    },
] as const;

export type AssistantWorkflowId = (typeof ASSISTANT_WORKFLOW_TEMPLATES)[number]["id"];

export const ASSISTANT_AGENT_ACTIONS = [
    {
        id: "reverse-prompt",
        title: "反推图片提示词",
        summary: "从参考图整理可编辑描述",
        prompt: "根据本轮引用的图片或当前画布选中的图片反推提示词。若没有可读取的图片，先请我添加图片，不要猜测图片内容。先整理主体、构图、色彩、光线、风格与材质，再给出可编辑的正向提示词和负向限制词；必要时从可用技能目录载入相关技能。把结果作为新的可编辑文本节点连到参考图。只做分析，不生成图片，不覆盖源图或已有提示词。",
    },
    {
        id: "optimize-prompt",
        title: "优化创作提示词",
        summary: "保留意图，生成清晰的新版本",
        prompt: "请优化本轮提供、引用或选中的提示词，同时保留我的核心意图。若没有源提示词，先请我粘贴或选择画布文本节点。按需要补全主体特征、场景构图、光线、风格、细节、画幅与负面限制；输出主要调整点和完整可编辑的新提示词，并将它放入独立文本节点，不覆盖原内容，也不要自动发起计费生成。必要时先选择适合的内置技能。",
    },
    {
        id: "refine-image",
        title: "细化参考图片",
        summary: "保留原图，先确认编辑范围和费用",
        prompt: "基于本轮引用或当前画布选中的图片帮我做细化。若没有图片或具体修改目标，先询问我，不要猜测要改什么。保持我明确要求保留的主体和细节；根据当前模型真实支持的能力，准备全图衍生或局部编辑提议，保留源图并把结果放到新节点。先说明模型、输出数量和费用，由我确认后再执行；如果模型不支持局部编辑或细节增强，请明确说明，不要用裁切或插值冒充 AI 细化。",
    },
] as const;

export type AssistantAgentActionId = (typeof ASSISTANT_AGENT_ACTIONS)[number]["id"];

export type AssistantCreationKind = "image" | "video";

export function assistantCreationPrompt(kind: AssistantCreationKind) {
    if (kind === "image") {
        return [
            "帮我直接生成一张图片。",
            "",
            "画面内容：",
            "风格与氛围：",
            "",
            "请把本轮附件作为实际生成参考，结合我的描述完善提示词，在当前画布创建图片生成节点并连接参考素材，提交生成提案后等我确认再开始。",
        ].join("\n");
    }
    return [
        "帮我直接生成一段视频。",
        "",
        "画面内容与动作：",
        "镜头运动：",
        "时长与画幅：",
        "",
        "请把本轮附件作为实际生成参考，结合我的描述完善提示词，在当前画布创建视频生成节点并连接参考素材，提交生成提案后等我确认再开始。",
    ].join("\n");
}

export function assistantCreationDraft(current: string, kind: AssistantCreationKind) {
    const prompt = assistantCreationPrompt(kind);
    const existing = current.trimEnd();
    if (!existing || existing === assistantCreationPrompt("image") || existing === assistantCreationPrompt("video")) return prompt;
    return `${existing}\n\n${prompt}`;
}
