# 波波 AI 画布文件盘点

盘点基线：2026-10-22。本文用于区分当前产品文件、运行时兼容文件、研究资料和历史证据，避免因为改品牌而误删协议或用户数据迁移能力。

## 顶层目录

| 目录 | 分类 | 用途 | 处理结论 |
| --- | --- | --- | --- |
| `web/` | 产品核心 | Web MVP、画布、Agent 对话、项目、素材、任务与设置 | 保留 |
| `backend/` | 产品核心 | Go API、本地工作区、任务、资源、模型和兼容服务 | 保留；内部包名暂不改，涉及 Go import 和数据迁移 |
| `agent-host/` | 产品核心 | 波波创作 Agent 的 Durable 会话宿主和工具桥 | 保留 |
| `plugin-packages/` | 产品核心 | 模型/媒体协议插件包 | 保留；`.beeftv-plugin` 是当前包格式 |
| `assets/readme/` | 产品展示 | 波波品牌 Logo、演示视频和 README 按钮 | 保留 |
| `assets/prototypes/` | 设计资料 | 业务架构和画布交互原型 | 保留，供设计评审 |
| `fixtures/` | 测试数据 | 模型目录、协议和回归夹具 | 保留；不是用户生产数据 |
| `scripts/` | 构建与验收 | Web/桌面构建、打包、迁移和发布门禁 | 保留；旧脚本名暂作兼容入口 |
| `docs/product/` | 当前产品文档 | PRD、架构、模块地图、迁移说明和验收范围 | 只放波波 AI 画布当前定义 |
| `docs/research/` | 参考研究 | JustAI 等外部产品拆解和兼容借鉴 | 与产品文档隔离 |
| `docs/refactor/` | 工程记录 | 代码地图、专项回归、实施合同和历史修补 | 保留为工程证据，不等于产品已发布 |
| `docs/release-evidence/` | 历史证据 | 已有版本的发布/验收记录 | 保留原始事实，不改历史仓库和版本信息 |
| `docs/superpowers/` | 历史设计 | 已执行或暂停的专项设计稿 | 保留；新需求以当前产品文档为准 |
| `output/`、`.local/` | 本地产物 | 浏览器证据、缓存、测试和开发数据 | Git 忽略，不属于产品交付 |

## 已删除文件

本轮确认没有代码、构建、测试或文档引用的旧展示资产已删除：

- `assets/assets-default-tags-installed.png`
- `assets/assets-no-recycle-bin-*.png`
- `assets/assets-unified-*.png`
- `assets/huabu-loading-installed.png`
- `assets/huabu-loading-preview.svg`
- `assets/app-icon.svg`
- `web/public/huabu-mark.svg`
- `web/public/logo.svg`

## 明确保留的历史标识

`Huabu`、`BeefTV`、`BeefAPI`、`LibTV`、`HUABU_*`、`X-Huabu-*`、`X-Beeftv-*`、`huabu` Go module 和 `.beeftv-plugin` 仍可能出现在运行时代码、协议、测试、安装包、历史导入 fixture 或数据 key 中。它们不是当前品牌，但删除会破坏已安装工作区、协议兼容、构建门禁或历史数据读取。统一迁移需要单独的双读、双写、升级和回滚方案；首页、项目卡片和新建流程不再使用这些旧视觉入口。

## 当前产品功能索引

当前功能结构以以下文档为准：

- Agent 对话、提案确认和内置 Skill：[`功能清单`](../content/docs/overview/features.mdx)
- Agent/画布/提示词/媒体/远端数据分层：[`产品架构`](bobo-ai-canvas-architecture.md)
- 模块职责和 P0/P1/P2 边界：[`模块地图`](bobo-ai-canvas-module-map.md)
- 目录迁移和兼容保留项：[`迁移说明`](bobo-ai-canvas-migration-notes.md)

## 本轮自查结论

- `web/package.json` 与 `web/bun.lock` 的工作区名称已统一为 `bobo-ai-canvas`。
- `web/index.html`、默认外观、首页空态、项目预览和演示媒体只使用“波波 AI 画布 / Bobo AI Canvas”品牌资产。
- 兼容导入和历史 fixture 的协议字段仍保留，但用户可见的导入提示已统一为“兼容画布”；旧参考项目名不会出现在普通首页或新建流程。
- `docs/product/justailab/` 已不再有受版本控制的文件；外部参考资料统一位于 `docs/research/competitors/justailab-reference/`。
- 本轮未删除协议、数据 key、迁移字段、发布脚本或回归 fixture；这些内容需要单独的双读/双写迁移后才能下线。
