# justailab × bobo 兼容改造 · 差距分析与开发计划

> 日期：2026-10-22
> 输入：bobo-ai-canvas 全仓代码级调研（skills / assistantturns / agentops / generation / modelcatalog / operations / agent-host / 前端）× 三份 justailab 分析文档
> 重点（用户指定）：**① Skill 的创建应用 ② Agent 直出图片视频的工作流**
> 结论先行：**bobo 的底座比 justailab 更深——3 项已超越、5 项对等；真正缺的是「市场运营字段 + 3 种技能创建方式 + 单图直出工具 + schema 配图模板引擎」四件，合计约 15 个工作日。**

---

## 〇、三个修正既有判断的发现

调研前（v2 路线计划）的假设 vs 代码事实：

| 假设 | 事实（代码证据） | 影响 |
|---|---|---|
| bobo 无自动路由，需建 P1 | **`skill_load` 工具已存在**（`agent-host/durable-session-owner.mjs:170`），技能目录按 name+description 广告进系统提示词（`skill-resource.mjs:115`：「用户的要求符合某个技能的说明时，先调用 skill_load 并传入它的 id」） | **v2 的 P1（3 天）整个省掉**——justailab 的 `runtime_skill_recommend` 在 bobo 是原生能力且更早实现 |
| agent 不能直出图片视频 | **视频已可直出**：agent 调 `canvas.configure` 写媒体节点提示词 → `canvas.render` op 建时间线渲染任务（`operations/canvas_render.go:64`，返回 taskId） | 直出闭环只剩**单图**一环 |
| 出图靠 prompt-driven 即可 | justailab 的 `note_illustration` 是 **schema 驱动**（模板声明 `propertiesJSONSchema` → 前端渲染表单 → 后端按 `req_key` 路由模型），bobo 无对应物（全仓 0 命中） | 需新建配图模板引擎 |

---

## 一、bobo 现有资产盘点（代码级证据）

### 1.1 三层能力对照

| 层 | justailab | bobo 现状 | 证据 | 判定 |
|---|---|---|---|---|
| 技能格式 | SKILL.md+references | zip/md/GitHub 三源安装 + frontmatter 解析 + references 递归 | `skills/skill_packages.go` 1011 行 | ✅ **超越**（justailab 两项不支持） |
| 版本化 | 无（技能不可变） | 内容哈希=版本 + Pin 三角 {skillId,versionId,contentHash} | `skills/agent_resources.go` Pin 类型 | ✅ **超越** |
| 权限门禁 | 平台级布尔 `market_prompt_visible` | Scope 门禁：visibleSkill + UserSkillState.Added + PackageKey 防伪造 | `agent_resources.go:agentPackage()` | ✅ **超越**（精确到版本） |
| 按需加载 | skill_load/skill_read_file | **skill_load 工具 + 目录广告 + linked-context 交付**（4 技能/32k 字符/3 文件） | `agent-host/skill-resource.mjs`、`SKILL_RUNTIME_PROFILES` | ✅ 对等（已实现） |
| 自动路由 | runtime_skill_recommend | **skill_load + 系统提示词指令**（「符合说明时先调用 skill_load」） | `system-prompt.mjs:31` | ✅ 对等（已实现） |
| Agent 协议 | SSE `data:{json}\n\n` | **NDJSON 类型化事件流**（session/text_delta/lifecycle/turn_end）+ 截断检测 +  malformed 行判定 | `agent-assistant.ts:readAgentTurnStream` | ✅ **超越**（更稳） |
| 回合机制 | 单发 chat_stream | **回合制**：Begin/Extend/Undo/RuntimeState + 提案门禁（waiting_proposal）+ 权限模式冻结 | `assistantturns/service.go`、`runtime.go` | ✅ **超越** |
| 工具调用 | 服务端内部 | **ops 注册表动态工具面**（GET /ops → 按 assistantModes+permissionMode 过滤）+ function_call 协议 | `operation-bridge.mjs:buildTools`、`generation/agent_protocol.go` | ✅ 对等 |
| 模型目录 | req_key + 视频列表热配置 | **modelcatalog 8521 行**：能力准入/通道协议/GeminiImage/视频水印/托管模型 | `modelcatalog/admission.go` | ✅ **超越** |
| 生成引擎 | chat_stream 隐式 | **generation 18020 行**：即梦/方舟/可灵/grok/fal-h3/seedance 预上传/视频轮询/审核 | `generation/` 30+ 文件 | ✅ **超越** |
| 出图 Provider | gemini-3.1-flash-image | Gemini 直连 + OpenAI 兼容 + 即梦 + 方舟 | `image-models.ts`、`provider/bailian` | ✅ 对等 |
| 流式 | SSE | OpenAI/Claude/Gemini 三协议流式 | `image-streaming.ts` | ✅ 对等 |
| 市场 UI | 探索/技能包双 Tab | 技能广场 4 Tab + 排序 + 分类（含 ecommerce）+ 详情/编辑器/安装抽屉 | `pages/skills/index.tsx` | ✅ 对等 |
| 提示词模板 | SKILL.md 注入 | prompts 层（agent-media-policy/system-policy/template 体系） | `prompts/` | ✅ 对等 |

### 1.2 市场运营字段对照（justailab 46-48 字段 vs bobo SkillItem）

| justailab 字段 | bobo 对应 | 状态 |
|---|---|---|
| usage_count / last_used_at | LikeCount / AddedCount（**语义不同**：加入≠使用） | ❌ 缺 |
| is_featured | SortWeight（排序权重，非精选位） | ❌ 缺 |
| author_type（official/user） | Source（1=用户）+ EffectiveUser | ◐ 半对等 |
| review_status / market_status | IsPrivate + publish/unpublish | ◐ 半对等 |
| price / sale_options | 无 | ❌ 缺（本地版可只留骨架） |
| load_strategy（on_demand/manual） | skill_load 即 on_demand；manual 无对应 | ◐ 语义已有 |
| origin_skill_id / is_shared_copy | **OriginalSkillID** | ✅ 已有 |

---

## 二、重点一：Skill 创建应用闭环

### 2.1 justailab 五件套 vs bobo 改造映射

| justailab 创建方式 | bobo 现状 | 改造动作 | 成本 |
|---|---|---|---|
| `create` 手动创建 | ✅ `POST /skills`（SkillMutationRequest） | 无 | — |
| `import_folder` 文件夹导入 | ◐ zip/md 上传（`/skills/install`，FormFile 单 file） | **补多文件文件夹导入**：`files[]`+`relative_paths[]`（justailab 同款 FormData 结构），SKILL.md 定位校验 | **小（1 天）** |
| `ai_draft` AI 起草 | ❌ | **新增**：输入（想法文本/链接/图）→ LLM 生成 `{skillName, description, instruction}` 三件套 → 进编辑器人工修订。复用 prompts 层 + 现有助手通道 | **中（2 天）** |
| `create_from_conversation` 对话总结 | ❌ | **新增**：取一回合 assistantturns 历史 → LLM 提炼为 SKILL.md（justailab 同款）。回合数据已在库（Record/SkillPins） | **中（1.5 天）** |
| `create_system` 系统批量 | ◐ `seed/skills.json` 静态种子（33 个，质量高） | 种子即系统创建通道，无需新端点；补「种子导入脚本」便于批量扩充 | 小（0.5 天） |

### 2.2 description 三段式规范（justailab 生产管线的核心）

justailab 231 个技能全量遵守：**① 触发条件（「当你提供 X 时」/「适用于」）② 产出形态（「批量生成一套包含…」）③ 风格约束（「目标是实现…通过…」）**，中位 74 字符。bobo 现有 33 个种子已接近该范式（「本技能用于…」式），但无校验。

**改造**：技能创建/导入时对 description 做三段式弱校验（至少含触发词 + 动作词），不合法给 warning 不阻断；市场卡片展示「自动触发/仅手动」徽标（load_strategy 语义已有）。**成本：0.5 天 + 文档**。

### 2.3 运营字段补齐（justailab 市场层）

Skill 模型加 `UsageCount`/`LastUsedAt`/`IsFeatured`/`AuthorType`，`skill_load` 工具成功回执时递增（agent-host 已有工具执行点）；市场排序加「最多使用」。**成本：1.5 天（含迁移）**。

---

## 三、重点二：Agent 直出图片视频工作流

### 3.1 现有链路（代码实证）

```
视频（已通）：
  agent → canvas.configure（写媒体节点 prompt）→ canvas.render（建 TimelineRender 任务，返回 taskId）
       → taskruntime 执行 → 轮询/回调 → 节点出片
单图（断点）：
  agent → ??? （无工具）——只能写 prompt 草稿，无法直出
       → 用户需手动到创作台/节点面板触发生成
```

### 3.2 断点补齐：`media.generate` op（核心新建）

在 ops 注册表新增 agent 工具 `media.generate`，参数对齐 justailab 配图模板 + generation 包现有能力：

```
media.generate {
  prompt: string            // 必填
  ratio: "3:4"|"9:16"|"1:1"|"16:9"   // 平台预设默认
  referenceImages?: []      // 参考图（generation 已支持）
  model?: string            // 缺省走 modelcatalog 路由（gemini-image）
  skillContext?: pin        // 可选：技能版本溯源
}
→ 调 generation 包出图 → 落 asset → 返回 assetId + url
→ agent 继续把图绑到画布节点（canvas_node_bind_asset 已有）
```

**为什么是 op 而非独立端点**：bobo 的工具面是 ops 注册表动态生成的（`GET /ops` → descriptors → buildTools），加一个 op 即自动获得：权限模式过滤、回合预算、重放安全判定、审计日志——**与 justailab 把出图藏在服务端不同，bobo 的出图工具直出但仍在同一套权限/预算/审计框架内**。

**成本：3 天**（op 定义 + generation 包单图入口适配 + 前端回合流展示 asset 结果 + 测试）。

### 3.3 schema 驱动配图模板引擎（justailab note_illustration 对应物）

justailab 的差异化设计：模板 = JSON Schema 声明参数 → 前端渲染表单 → 后端按 `req_key` 路由模型。bobo 全仓无对应物。

**新建 `IllustrationTemplate` 模型**（本地存储，对齐 justailab 字段）：

```json
{
  "templateId": "xhs-product-card",
  "title": "小红书商品卡片",
  "credits": 0,                        // 本地版无计费，留字段对齐
  "schema": {
    "type": "AIGeneratedTextImage",
    "model": "gemini-image",
    "req_key": "google/gemini-3.1-flash-image",
    "render_mode": "ai_image",
    "image_gen_config": { "quality": "high", "pic_scale": "3:4" },
    "propertiesJSONSchema": {
      "required": ["text", "image_prompt"],
      "properties": {
        "text": { "type": "string", "title": "卡片文案" },
        "image_prompt": { "type": "string", "title": "画面描述" }
      }
    }
  }
}
```

**三处消费方**：
1. 创作台「模板」面板：表单渲染 → 调 `media.generate`（req_key 走 modelcatalog）
2. agent 工具 `illustration.render`：模型按模板 schema 填参直出（justailab 的「技能×模板联动」对应物）
3. 技能 SKILL.md 可引用模板 id（`references/illustration-templates.json`）

**成本：3 天**（模型 + 后端渲染路由 + 前端表单组件 + 5 个种子模板）。

### 3.4 平台预设（电商四平台）

justailab 实测配置：小红书 3:4、抖音/TikTok 9:16、公众号头图 2.35:1 等。bobo `video.go` 已有 ratios 校验但无平台概念。

**改造**：`platform-presets.json` 本地配置——每平台定义 {默认比例, 语言, 文案风格基线, 常用模板 id 列表}；`media.generate` 的 ratio 缺省值从平台预设取；TikTok 预设 language=en 并在 prompt 模板层加英文约束。**成本：1 天**。

---

## 四、市场运营层与表单工作流（justailab 其余可借鉴项）

| 项 | justailab | 改造 | 成本 |
|---|---|---|---|
| 表单工作流 | marketing_form（服务端下发 form JSON） | 本地 `scene-templates.json`：{form 字段, 预填 prompt, category, reply?} → 创作台「场景」面板渲染 → 发起回合 | 2 天 |
| 技能分享导入 | share/create/import + origin 追踪 | 导出 zip（已可 bundle 下载）+ 导入带 OriginalSkillID 溯源（字段已有） | 1 天 |
| 提示词门禁产品化 | 付费墙（商业） | 本地版即「编辑器才拉全文」——`skill-editor-drawer` 已天然满足，补文档说明 | 0.5 天 |
| 使用数据看板 | settlement/purchasers | 本地版简化：市场页「最多使用」排序 + 技能详情使用趋势 | 含在 §2.3 |
| ~~裂变/支付/结算/小程序~~ | — | **不复刻**（既定决策） | — |

---

## 五、开发计划（P0-P4，约 15 个工作日）

> 与 v2 路线计划的差异：**P1 触发路由整体删除**（bobo 已原生支持，省 3 天）；省下的工期投入 ai_draft/from_conversation 与 media.generate 两大新建。

### P0 · 市场运营字段 + 创建补齐（3.5 天）

| # | 任务 | 产出 |
|---|---|---|
| 0.1 | Skill 模型 +UsageCount/LastUsedAt/IsFeatured/AuthorType + 迁移 | 市场有真运营数据 |
| 0.2 | skill_load 成功回执埋点 + 「最多使用」排序 | 使用量可回收 |
| 0.3 | import_folder 多文件导入（files[]+relative_paths+SKILL.md 校验） | 文件夹导入对齐 justailab |
| 0.4 | description 三段式弱校验 + 「自动触发」徽标 | 路由质量有保障 |

**验收**：导入一个含 SKILL.md+references/ 的文件夹成功；用技能后市场使用量 +1；三段式不合规给 warning。

### P1 · 技能 AI 生产管线（4 天）

| # | 任务 | 产出 |
|---|---|---|
| 1.1 | `ai_draft` 端点：想法/链接/图 → LLM 生成三件套 → 编辑器修订 | 「说想法得技能」 |
| 1.2 | `create_from_conversation`：回合历史 → LLM 提炼 SKILL.md | 「好对话存成技能」 |
| 1.3 | 种子导入脚本（skills.json 批量扩充） | 12 个电商种子可脚本化导入 |
| 1.4 | 《电商技能创作指南》（三段式规范+示例+模板） | 可对外的能力 |

**验收**：输入「我想做一个珠宝设计技能」→ AI 起草 → 修订 → 发布 → 市场可见 → 被 skill_load 路由命中。

### P2 · Agent 直出图片（5 天）——用户重点

| # | 任务 | 产出 |
|---|---|---|
| 2.1 | `media.generate` op（prompt/ratio/refs/model/skillContext）+ 权限/预算/审计接入 | **agent 对话里直出图片** |
| 2.2 | 回合流 asset 结果展示（NDJSON 新增 asset 事件类型） | 出图在对话内可见可取 |
| 2.3 | 画布绑定闭环：media.generate → canvas_node_bind_asset | 图直接落节点 |
| 2.4 | 平台预设配置（小红书 3:4/抖音 9:16/TikTok en） | 四平台一键切换 |
| 2.5 | 视频直出链路文档化（configure→render→task，已通，补 e2e 测试） | 视频链路有回归保障 |

**验收**：对 agent 说「生成一张保温杯小红书封面，3:4」→ 回合内出图 → 自动落画布节点；同一会话内可「再来一张/换个比例」。

### P3 · 配图模板引擎 + 电商场景包（4 天）——用户重点

| # | 任务 | 产出 |
|---|---|---|
| 3.1 | IllustrationTemplate 模型 + req_key 路由 + 前端表单组件 | schema 驱动模板引擎 |
| 3.2 | 5 个配图种子模板（商品卡/封面/详情图/清单/口播稿配图） | 模板开箱即用 |
| 3.3 | `illustration.render` agent 工具（模型按模板填参直出） | 技能×模板联动 |
| 3.4 | 12 个电商种子技能（v2 已定清单：种草/封面/详情/货架/剧情/口播/TikTok EN×2…） | 电商技能库 |
| 3.5 | scene-templates.json + 创作台场景面板（5 个电商表单工作流） | 零提示词入口 |

**验收**：选「商品种草图文」模板 → 填 5 字段 → 一次产出文案+封面+3 配图 → 落画布；agent 说「按商品卡模板出图」自动填参直出。

### P4 · 打磨与发布（3 天）

| # | 任务 | 产出 |
|---|---|---|
| 4.1 | 技能分享导入（导出/导入 + origin 溯源） | 技能可流通 |
| 4.2 | 暗色精修 + 卡片密度 + 4 字 label | 视觉一致 |
| 4.3 | e2e 回归：创建→发布→路由→直出→用量回收 全链 | 发布信心 |
| 4.4 | 文档：技能创作指南 + 模板制作指南 + 架构说明 | 可维护 |

**验收**：全链路 e2e 绿；导出技能给他人导入成功。

### 总览

| 期 | 工期 | 累计 | 对齐 justailab 的模块 |
|---|---|---|---|
| P0 市场+创建 | 3.5 | 3.5 | 市场层 + import_folder + 三段式 |
| P1 AI 生产线 | 4 | 7.5 | ai_draft + from_conversation |
| P2 单图直出 | 5 | 12.5 | note_illustration 调用面 + 平台预设 |
| P3 模板+场景 | 4 | 16.5 | note_illustration 引擎 + marketing_form |
| P4 打磨 | 3 | 19.5 | share + 文档 |

（v2 的 18 天 → 19.5 天：新增单图直出与模板引擎两大件；触发路由 3 天已省。）

---

## 六、风险与边界

1. **`media.generate` 的权限边界**：出图消耗真实 API 额度——必须接入既有回合预算（`spendToolStep`）与权限模式（full-access 才允许非只读执行），`operation-bridge` 已有框架，勿绕开。
2. **req_key 路由的模型可用性**：gemini-3.1-flash-image 等 justailab 同款 key 需在 modelcatalog 登记通道；国内访问稳定性需实测（P2 前置验证）。
3. **ai_draft 的质量**：LLM 生成的 SKILL.md 必须人工修订后才能发布——产品上要做「草稿态」，与 review_status 状态机衔接。
4. **本文所有 justailab 结论**来自未登录态外部观察（三份分析文档的边界已声明）；购买/结算 UI 未实测，但那些模块本就明确不复刻。
5. **P0 启动前置**：bobo 工作区 40+ 未提交文件先 commit。

---

## 附：证据文件索引

| 结论 | 代码位置 |
|---|---|
| skill_load 工具 + 目录广告 | `agent-host/durable-session-owner.mjs:170`、`agent-host/skill-resource.mjs:115` |
| 自动路由系统指令 | `agent-host/system-prompt.mjs:31` |
| NDJSON 回合流 | `web/src/services/api/agent-assistant.ts:410-537` |
| Pin 三角 + Scope 门禁 | `backend/internal/skills/agent_resources.go` |
| ops 动态工具面 | `agent-host/operation-bridge.mjs:82-110` |
| canvas.render 建视频任务 | `backend/internal/operations/canvas_render.go:64` |
| generation 多 Provider | `backend/internal/generation/{image,video,jimeng,seedance_preupload}.go` |
| modelcatalog 能力准入 | `backend/internal/modelcatalog/admission.go` |
| 技能运行时配置 | `web/src/services/skill-runtime.ts`（4 技能/32k 字符/3 文件） |
| justailab 对照 | `nixiang/REA-分析-justailab-skill.md`、`REA-动态实测-…-2026-10-22.md`、`REA-深扒-…-2026-10-22.md` |
