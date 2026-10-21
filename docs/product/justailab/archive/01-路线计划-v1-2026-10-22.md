# 复刻 justailab（小加同学）核心平台 · 路线计划 v1

> 日期：2026-10-22
> 状态：**待用户审批**（文末 4 个决策点）
> 依据：`nixiang/REA-分析-justailab-skill.md`（静态）+ `REA-动态实测-justailab-skill-2026-10-22.md`（动态）+ `REA-深扒-justailab技能调用与生产管线-2026-10-22.md`（代码级）+ bobo-ai-canvas 现场调研（2026-10-22）
> 结论先行：**可以复刻，但不是"再做一个 justailab"，而是"把 bobo 的内容营销模式激活"**——地基已在，缺的是三层：市场层、触发路由、表单工作流。

---

## 一、可行性判断（诚实版）

### 1.1 全量复刻 = 不可行

justailab 是商业公司团队产品：115 个 `/agent/*` 端点、支付/订单/卡券、裂变增长、创作者结算、微信小程序、iOS App、百度统计+Clarity+Sentry 监控矩阵。零基础个人开发者全抄 = 必然烂尾。**明确不复刻**（见 §三）。

### 1.2 核心闭环复刻 = 可行，且地基已完成 70%

justailab 的产品内核只有一句话：**「技能市场（分发）× 触发式路由（调用）× 生成闭环（出内容）」**。现场调研 bobo 现状：

| 能力层 | justailab | bobo-ai-canvas 现状（实测代码规模） | 差距 |
|---|---|---|---|
| 模型目录/路由 | req_key + 热配置列表 | **`modelcatalog` 8521 行**（GeminiImage 通道/视频能力/托管模型 claude-opus-5-5/deepseek-v4.1-flash/glm-5.3/gemini-3.8-flash） | ✅ **已超越** |
| 生成闭环 | chat_stream 一条总线 | **`generation` 18020 行**（含 video_unified_delivery 视频统一交付）+ `creation` 包（租约/提交/策略/范围） | ✅ **已超越** |
| 出图 Provider | gemini-3.1-flash-image 等 | **`provider` 层**（bailian/registry/workflow）+ 前端 `image-models.ts`（gemini/OpenAI 双协议目录拉取） | ✅ 对等 |
| 提示词模板 | SKILL.md 注入 | **`prompts` 层**（agent-media-policy/system-policy/prompt_template 体系） | ✅ 对等 |
| 技能格式 | SKILL.md+references | Toonflow 格式（**frontmatter 解析 + references 递归**，justailab 两项都不支持） | ✅ **已超越** |
| 技能引擎 | 服务端 50 端点 | `skills` 2546 行 + handler 16 端点 + 版本化/Pin 三角/Scope 门禁/33 种子 | ✅ 引擎对等，**市场层缺失** |
| 技能市场 UI | 探索/技能包双 Tab | 技能广场页已解封（4 Tab/24 API 端点/详情抽屉/编辑器/安装模态） | ◐ 页面在，**运营字段为零** |
| 触发式路由 | description 三段式 + runtime recommend | description 仅校验非空；无自动路由开关 | ❌ **缺失** |
| 表单工作流 | marketing_form 热配置下发 | 无 | ❌ **缺失** |
| 使用数据 | usage_count/last_used_at/is_featured | LikeCount/AddedCount（语义不同） | ❌ **缺失** |
| 审核发布 | review_list + 状态机 | publish/unpublish（IsPrivate 单标志） | ◐ 半成品 |
| 商业化 | 支付/裂变/结算 | 无 | 🚫 **主动放弃** |

**结论：复刻 justailab 核心闭环 ≈ 在 bobo 上补 4 个缺失件（市场字段/触发路由/表单工作流/使用数据）+ 1 个场景包（小红书图文种子技能）。预计 15-20 个工作日。**

---

## 二、复刻范围收敛

### 2.1 复刻（核心闭环 8 项）

| # | 项 | justailab 原型 | bobo 落法 |
|---|---|---|---|
| R1 | 技能市场三态门禁 | 免费/付费/企业版卡片 | 免费/付费（本地版无企业版，用「会员」占位或砍） |
| R2 | 触发式 description 规范 | 三段式（触发条件+产出形态+风格约束） | SKILL.md 规范加校验 + 市场卡片展示「自动触发/仅手动」 |
| R3 | 自动路由开关 | runtime_skill_recommend | 助手侧栏偏好开关 + 服务端按 description 匹配 |
| R4 | 技能创建五件套 | create/import_folder/ai_draft/create_from_conversation/create_system | 已有 create/update；补 import_folder（zip/md 已有）/AI 起草（LLM 生成 SKILL.md）/对话总结 |
| R5 | 审核发布状态机 | review_status + market_status + published_at | 在 IsPrivate 之上加 review 态（可选，先最小：draft→listed） |
| R6 | 表单工作流 | marketing_form（服务端下发 form JSON → 前端渲染） | 创作台「场景模板」层：模板 JSON（表单+预填 prompt+category）存本地配置 |
| R7 | 使用数据回收 | usage_count + last_used_at | Skill 模型加字段，skill_load 成功回执递增 |
| R8 | 配图模板引擎 | note_illustration（schema + req_key） | 复用 modelcatalog：模板声明参数 schema + 模型路由键 |

### 2.2 明确不复刻（8 项，砍掉理由）

| 砍掉项 | 理由 |
|---|---|
| 支付/订单/卡券 | 个人无支付资质体系；本地优先产品无交易场景 |
| 裂变解锁/邀请助力 | 增长黑客设计，与「先自用」定位冲突 |
| 创作者分成/结算 | justailab 自己都没全量上线（其分析原文：「正在灰度发布中」） |
| 微信小程序/iOS App | 先 Web 验证（既定决策：先做 Web，后续再打包） |
| 团队额度共享 | 后置（bobo 已有 team 概念，但不进核心闭环） |
| 内容监控/笔记库 | 依赖发布平台回传，个人版无数据源 |
| 定时任务/内容日历 | 后置（bobo 已有 task 五段状态机可复用，但不进 v1） |
| Sentry/Clarity/百度统计 | 本地优先产品不上报 |

---

## 三、分期路线（P0-P4，每期有验收标准）

### P0 · 市场层最小闭环（预估 3 天）

**目标**：让「技能市场」从展示壳变成有运营数据的真市场。

| 任务 | 改动点 |
|---|---|
| Skill 模型加 `UsageCount`/`LastUsedAt`/`IsFeatured`/`AuthorType` | `backend/internal/skills/skills.go`、`model/models_platform.go` + 迁移 |
| skill_load 成功回执埋点递增 | `skills/agent_resources.go` 或对应 handler |
| 市场卡片展示「自动触发/仅手动」 | `web/src/pages/skills/index.tsx`（load_strategy 已有，仅展示） |
| 排序加「最多使用」 | 前端 sortOptions + 后端排序参数 |

**验收**：市场页显示使用量；用一个技能后用量 +1；按使用量排序正确。

### P1 · 触发式路由（预估 3 天）

**目标**：技能从「手动点选」进化到「Agent 按 description 自动挑」。

| 任务 | 改动点 |
|---|---|
| SKILL.md description 三段式规范（触发条件/产出形态/风格约束）+ 校验 | 技能导入/创建校验 + 文档 |
| 助手「自动路由」开关（justailab 的 runtime_skill_recommend 对应物） | 助手侧栏 + 用户偏好存储 |
| 服务端路由：请求带技能目录摘要 → 返回命中的 skill_id 集合 | 新增一个 `/api/assistant/skill-route` 端点（LLM 分类或规则匹配 v1） |
| 路由命中后走既有 manual_skill_ids 挂载链路 | 复用现有入口 |

**验收**：写一个三段式技能（如「当你提供菜名时，调用该技能，生成暖色食谱卡图文」），不开开关不命中、开开关后输入「帮我做秋季润燥食谱」自动挂载该技能。

### P2 · 表单工作流（预估 4 天）

**目标**：零提示词场景入口——用户填表，系统拼 prompt。

| 任务 | 改动点 |
|---|---|
| 场景模板数据模型（form 字段 JSON + 预填 prompt + category + 可选 reply） | 新本地配置表或 JSON 种子 |
| 创作台「场景」面板：模板列表 → 渲染表单 → 发起对话 | `web/src/pages/create/` 或画布创作台 |
| 模板热更新（本地配置即改即生效，对应 justailab 的服务端热配置） | 本地 JSON 读取（无需发版） |
| 首批 5 个场景模板（IP 起号/图文笔记/爆款封面/PPT/营销方案，仿 justailab marketing_form） | 种子数据 |

**验收**：创作台出现场景面板；填「IP 起号方案」10 字段表单 → 自动生成结构化 prompt → 助手产出方案；改 JSON 加新场景无需改代码。

### P3 · 内容营销场景包（预估 5 天）

**目标**：端到端跑通「一句话 → 可发布图文」——justailab 的主承诺。

| 任务 | 改动点 |
|---|---|
| 10 个小红书图文种子技能（严格按三段式规范手写，仿 justailab top 技能结构） | `skills/seed/skills.json` 扩充 |
| 配图模板引擎（note_illustration 对应物）：模板 schema + req_key → modelcatalog 路由 | `generation` 包扩展或新 `illustration` 包 |
| 图文技能 × 配图模板联动：技能产出文案 → 按模板出封面/配图 | 生成编排 |
| 封面比例/分辨率选项（3:4/9:16/1:1，justailab 实测配置） | 前端参数面板 |

**验收**：输入「帮我做一篇秋季护肤小红书图文」→ 自动路由命中技能 → 文案 + 封面 + 3 张配图一次产出，可直接保存到资料库/画布。

### P4 · 打磨与发布准备（预估 3 天）

| 任务 | 改动点 |
|---|---|
| 技能编辑器完善：prompt_content 仅所有者可见（justailab 付费墙的产品化对应——本地版即「编辑模式才拉全文」） | `skill-editor-drawer.tsx` |
| 技能分享导入（share 对应物：导出 zip + 导入 + origin 追踪） | 导入导出链路 |
| 视觉精修：暗色一致性、卡片密度、空态文案（4 字 label 原则） | 全局 |
| 文档：技能创作指南（三段式规范 + 示例） | `docs/` |

**验收**：完整走通 创建技能 → 发布 → 市场可见 → 被路由命中 → 产出内容 → 用量回收；导出一个技能给「另一个用户」导入成功。

### 总周期

| 期 | 工期 | 累计 |
|---|---|---|
| P0 市场层 | 3 天 | 3 |
| P1 触发路由 | 3 天 | 6 |
| P2 表单工作流 | 4 天 | 10 |
| P3 场景包 | 5 天 | 15 |
| P4 打磨发布 | 3 天 | 18 |

**约 3 周半（个人开发者零基础，按每天有效 4-5 小时计；每期结束都有可演示产出，任何一期后停下都是完整功能）。**

---

## 四、差异化定位（不做抄袭，做 justailab 没有的）

| 维度 | justailab | bobo 复刻版 |
|---|---|---|
| 承载 | 对话流（聊完即走） | **画布**：生成物落节点，可再编排（bobo 主场） |
| 技能格式 | frontmatter 不解析/references 不递归/同名即失败 | **三层全支持**（已实现） |
| 数据 | 全云端 | **本地优先**（隐私 + 离线） |
| 提示词资产 | 付费墙（商业保护） | 本地全透明（自用定位） |
| 工作流 | 服务端热配置 | 本地 JSON 配置（同等灵活，无需服务端） |

一句话定位：**「justailab 的技能市场 × bobo 的画布」——技能是弹药，画布是战场。**

---

## 五、待拍板决策（4 项）

1. **基底**：bobo 扩展（本计划默认，推荐）vs 新起 Next.js 项目（等于放弃已有 8521 行 modelcatalog + 18020 行 generation，强烈不建议）
2. **场景方向**：小红书内容营销（justailab 主场景，市场验证过）vs 通用创作（PPT/文案/网页全谱系）vs **书籍可视化（你的 Eazo 参赛赛道——把 justailab 机制用于读书笔记可视化是没人做过的差异点）**
3. **出图模型通道**：Gemini（bobo 已有 GeminiImage 通道，justailab 同款）vs 国内通道（bailian/即梦，访问稳定性）
4. **与参赛关系**：此复刻品是否作为 Eazo 参赛作品（若是，P3 场景包应改向书籍可视化定制）？

---

## 附：本计划的证据索引

| 结论 | 证据 |
|---|---|
| bobo 模型/生成/技能三层规模 | `backend/internal/{modelcatalog,generation,skills}` 行数实测（8521/18020/2546） |
| bobo 已有 gemini 出图契约 | `web/src/services/api/image-models.ts`（generativelanguage.googleapis.com + OpenAI 双协议） |
| bobo provider 层 | `backend/internal/provider/{bailian,registry,workflow}` |
| justailab 核心闭环 | 三份 justailab 分析文档（静态/动态/深扒） |
| 不复刻项依据 | justailab 分析：结算「灰度发布中」；bobo 定位：本地优先 |
