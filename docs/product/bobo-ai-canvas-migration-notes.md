# 波波 AI 画布兼容改造与目录迁移说明

## 命名规则

公开产品名称统一为 **波波 AI 画布**，英文标识为 **Bobo AI Canvas**。用户可见的标题、Logo、首页、帮助文案、产品文档和发布说明必须使用新名称。

代码目录按产品职责组织：

| 目录 | 当前职责 | 处理方式 |
| --- | --- | --- |
| `web/` | 浏览器工作区和产品 UI | 保留；是 Web MVP 入口 |
| `backend/` | API、任务、资源、模型和本地运行时 | 保留；内部包名暂不改动，避免破坏 Go import 和数据迁移 |
| `agent-host/` | Agent 会话宿主与工具桥 | 保留；作为波波创作 Agent 的运行时实现 |
| `plugin-packages/` | 模型与媒体协议包 | 保留；扩展名属于协议格式 |
| `docs/product/` | 当前 PRD、架构和模块验收文档 | 只放波波 AI 画布当前产品文档 |
| `docs/research/` | 竞品、参考项目和外部调研 | 参考资料与产品文档隔离 |
| `docs/refactor/` | 实现合同、专项回归和历史工程记录 | 保留为工程证据，不作为产品承诺 |
| `docs/release-evidence/` | 历史版本发布证据 | 保留原始事实，不改写旧仓库链接 |

## 兼容标识保留清单

以下名称暂时不能改成品牌名：

- `BeefAPI`：现有内置兼容渠道、模型目录、价格和测试使用的协议/渠道 ID。
- `.beeftv-plugin`：插件包格式和构建门禁使用的扩展名。
- `HUABU_*`：环境变量、测试开关和发布脚本参数；改名需要独立迁移和双读周期。
- `X-Huabu-*`、`X-Beeftv-*`：HTTP 内部协议头，服务端和客户端必须同时升级。
- `LibTV`：历史画布导入、fixture 和兼容布局命名空间；只在读取旧数据或兼容测试中保留，当前首页、项目卡片和新创作入口使用波波 AI 画布自己的产品状态。
- `huabu` Go module、命令目录和 localStorage key：涉及导入路径、数据迁移和现有用户工作区。

这些标识不应出现在首页、导航、用户帮助、公开下载页或新产品介绍中；协议文档应注明“历史兼容标识”。

## 已清理的无效展示资产

- `assets/huabu-loading-installed.png`
- `assets/huabu-loading-preview.svg`
- `web/public/huabu-mark.svg`
- `web/public/logo.svg`

它们没有被构建入口、页面、测试或资源服务引用；现行启动图标、网页 Logo 和加载遮罩使用 `bobo-mark.svg` 及 `assets/readme/bobo-*`。

## 迁移顺序

1. 先统一公开文案和文档索引，避免新旧产品概念混用。
2. 再把参考研究移到 `docs/research/competitors/`，并将归档路线与当前 PRD 分离。
3. 运行 Web 品牌测试、类型检查和构建；检查安装/升级脚本仍能找到协议文件。
4. 商业化服务上线时，为环境变量、API 头和数据 key 提供双读迁移，再考虑删除旧别名。
