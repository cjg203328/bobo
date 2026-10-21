<p align="center">
  <img src="assets/readme/huabu-wordmark.svg" width="640" alt="Huabu — High-performance, lightweight, AI-native video workspace">
</p>

<p align="center"><strong>High-performance · Lightweight · AI Native</strong></p>

<p align="center">
  面向 AI 时代的视频创作工作台。<br>
  在一个自由画布中连接创意、模型与素材。
</p>

<p align="center">
  <a href="https://github.com/glanderness/BeefTV/stargazers"><img src="https://img.shields.io/github/stars/glanderness/BeefTV?style=flat-square&amp;logo=github&amp;label=Stars&amp;labelColor=303030&amp;color=E86C36" alt="Huabu GitHub Stars"></a>
  <a href="https://github.com/glanderness/BeefTV/releases/latest"><img src="https://img.shields.io/github/v/release/glanderness/BeefTV?style=flat-square&amp;label=Release&amp;labelColor=303030&amp;color=525252" alt="Huabu 最新版本"></a>
  <a href="QUICKSTART.md#下载与首次打开"><img src="https://img.shields.io/badge/Desktop-macOS%20%7C%20Windows-525252?style=flat-square&amp;labelColor=303030" alt="桌面版支持 macOS 和 Windows"></a>
  <a href="QUICKSTART.md"><img src="https://img.shields.io/badge/Workspace-Local--first-525252?style=flat-square&amp;labelColor=303030" alt="本地优先工作区"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-525252?style=flat-square&amp;labelColor=303030" alt="MIT 许可证"></a>
</p>

<p align="center">
  <a href="https://huabu.app/"><img src="assets/readme/button-website.svg" width="180" alt="访问 Huabu 官网"></a>
  <a href="https://github.com/glanderness/BeefTV/releases/latest"><img src="assets/readme/button-download.svg" width="175" alt="下载 Huabu 桌面版"></a>
  <a href="https://huabu.app/assets/huabu-wecom-qr.png"><img src="assets/readme/button-community.svg" width="185" alt="扫码加入 Huabu 社群"></a>
  <a href="https://x.com/beefnoode"><img src="assets/readme/button-x.svg" width="180" alt="在 X 关注 @beefnoode"></a>
</p>

<p align="center">
  <a href="#产品演示">产品演示</a> ·
  <a href="docs/content/docs/overview/features.mdx">功能清单</a> ·
  <a href="QUICKSTART.md">开始使用</a> ·
  <a href="CONTRIBUTING.md">参与贡献</a>
</p>

## 产品演示

https://github.com/user-attachments/assets/94fe6a39-6933-44b3-a9a9-dbc28b2d284c

[下载产品演示视频](assets/readme/huabu-demo.mp4)

## Why Huabu

| High Performance | Lightweight | AI Native |
| --- | --- | --- |
| 面向复杂创作画布优化。视口渲染、节点加载、媒体预览与生成任务彼此解耦，让项目增长时仍能保持顺畅操作。 | 以低资源占用和低使用门槛为目标。一个桌面工作区即可开始创作，能力按需加载，追求轻量化 | AI 不是附加按钮，而是工作台中不可或缺的一部分。让Agent真正参与并且主导你的AIGC创作流程。 |

## 一个画布，完整创作链路

- **生成**：从提示词或参考素材生成文字、图片、视频与音频。
- **组织**：用节点和连线建立素材关系、创作上下文与生成流程。
- **加工**：继续裁切、标注、局部重绘、拆分、引用和组合结果。
- **迭代**：保留过程、复用素材，让一次生成变成可持续演进的工作流。

Huabu 同时提供项目库、个人资产库、异步任务、模型渠道与创作工具。完整范围见[功能清单](docs/content/docs/overview/features.mdx)。

## 工作方式

```text
想法 / 参考素材
       ↓
AI Native 自由画布
       ↓
模型 + 创作工具
       ↓
文字 / 图片 / 视频 / 音频 / 分镜
       ↓
可编辑、可复用、可继续生成的工作流
```

## Open by design

- 可以自由配置文本、图片、视频与音频模型渠道，不绑定单一 Provider。
- 项目、画布、素材与任务由统一工作区管理，数据可以本地保存和迁移。
- 桌面端基于 React、Go 与 Wails，模型协议和工作台能力可继续自定义或者扩展。

## 开始使用

下载桌面版及 Mac 首次打开说明见 [快速开始](QUICKSTART.md#下载与首次打开)。

```bash
git clone https://github.com/glanderness/BeefTV.git
cd Huabu
./scripts/build-huabu-release.sh
```

详细环境要求、Windows 构建与本地开发方式见 [`QUICKSTART.md`](QUICKSTART.md) 和[桌面发布文档](docs/desktop-release.md)。首次启动后，添加自己的模型渠道即可开始创作。

## 本地开发端口与数据目录

### 当前端口（以脚本与 Compose 为准）

| 服务 | 端口 | 定义位置 |
| --- | --- | --- |
| Web 前端（Vite dev / preview） | `1010` | `web/package.json` |
| 后端 API（Gin） | `2010` | `backend/cmd/server/main.go`、`backend/internal/bootstrap/config.go` |
| Nginx（Compose 内置 Web） | `1010` | `nginx.conf` |
| 前端代理目标（本地开发） | `http://127.0.0.1:2010` | `web/vite.config.ts` |

### 端口规划（已执行）

画布目录下多个项目默认都占用 `3000`，为便于并行启动，Huabu 已切换到独立端口：

| 服务 | 实际端口 | 区间依据 |
| --- | --- | --- |
| Web 前端 | `1010` | 前端 `1001–2000` |
| 后端 API | `2010` | 后端 `2001–3000` |

同目录其他项目的已占用端口，规划时需一并规避：

| 项目 | 占用端口 |
| --- | --- |
| BeefTV | `3000`（Web）、`8080`（API） |
| VOZEB-PRO | `3000`（主应用）、`3001`（文档站）、`5432`（PostgreSQL） |
| Toonflow-app | `3000`（Bun 服务） |
| AI-Canvas-tauri | `1420`（Vite dev） |

本次切换到 `1010` / `2010` 已同步修改以下位置：

- `web/package.json`：`dev`、`dev:slim`、`start` 三处 `--port`
- `web/vite.config.ts`：`apiProxyTarget` 默认值
- `backend/cmd/server/main.go`、`backend/internal/bootstrap/config.go`、`backend/internal/assistantruntime/env.go`：`CANVAS_BACKEND_ADDR` 与端口兜底
- `backend/cmd/desktop/wails.json`：`frontend:dev:serverUrl`
- `scripts/start-local.ps1`、`scripts/huabu-shared-dev.sh`：端口占用检查与访问提示
- `web/scripts/huabu-local-network-audit.mjs`：审计脚本默认地址
- `nginx.conf`：`listen` 与 `proxy_pass`
- `docker-compose.yml`、`docker-compose.dev.yml`、`docker-compose.local.yml`：`ports`、`CANVAS_BACKEND_ADDR` 与 `CANVAS_CORS_ORIGINS`
- `Dockerfile`、`backend/Dockerfile`：`EXPOSE` 与 `HEALTHCHECK`

### 数据目录与启动

后端默认使用 SQLite，无需单独的数据库账号与密码；启动脚本见 `scripts/start-local.ps1`。

| 项 | 值 |
| --- | --- |
| 数据库 | SQLite（GORM 管理，无账号密码） |
| 开发数据目录 | `.local/project-workbench-debug`（`CANVAS_BACKEND_DATA_DIR`，已被 Git 忽略） |
| 本地缓存目录 | `.local/cache` |
| 常用环境变量 | `CANVAS_BACKEND_ADDR`、`CANVAS_BACKEND_DATA_DIR`、`CANVAS_CORS_ORIGINS`、`VITE_API_PROXY_TARGET`、`CANVAS_WEB_HOST_PORT`、`CANVAS_BACKEND_HOST_PORT` |

宿主机开发命令与 Compose 使用方式见 `AGENTS.md` 第 7 节；环境变量完整说明见 [`QUICKSTART.md`](QUICKSTART.md) 与 `docs/`。

## 贡献与许可

欢迎提交 Issue 和 Pull Request。开发流程与测试要求见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

项目按照 [`LICENSE`](LICENSE) 发布；上游来源、保留声明与第三方归属见 [`NOTICE`](NOTICE)。

## ⭐ Star History

<a href="https://www.star-history.com/?repos=glanderness%2FHuabu&amp;type=date&amp;legend=bottom-right">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=glanderness/BeefTV&amp;type=date&amp;theme=dark&amp;legend=bottom-right" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=glanderness/BeefTV&amp;type=date&amp;legend=bottom-right" />
    <img alt="Huabu GitHub Star History" src="https://api.star-history.com/chart?repos=glanderness/BeefTV&amp;type=date&amp;legend=bottom-right" />
  </picture>
</a>
