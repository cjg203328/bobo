# Huabu 本地桌面开发与验收

Huabu 的桌面版是 Wails 应用：前端运行在 WebView，Go 后端在同一进程内启动一个仅监听 `127.0.0.1` 的 loopback API。桌面 profile 不注册交互式登录路由，首次启动通过 `/api/workspace/bootstrap` 创建或读取本地工作区。

## 数据位置

默认数据目录由 Go 的 `os.UserConfigDir()` 决定，最终目录为 `<系统用户配置目录>/Huabu`。Windows 上是 `%AppData%\Huabu`，macOS 上是 `~/Library/Application Support/Huabu`。

其中包含本地 SQLite 数据库、资源文件和迁移备份。验收或调试时可通过环境变量指定隔离目录：

```bash
CANVAS_DESKTOP_DATA_DIR="$(mktemp -d /tmp/huabu-data.XXXXXX)" \
  backend/cmd/desktop/build/bin/Huabu.app/Contents/MacOS/Huabu
```

Windows：

```powershell
$env:CANVAS_DESKTOP_DATA_DIR = Join-Path $env:TEMP "huabu-data"
backend\cmd\desktop\build\bin\Huabu.exe
```

这个变量只改变数据目录，不改变应用的本地工作区和无登录行为。官方插件仍然从可执行文件旁边的 `plugin-packages\` 加载，不跟数据目录走。

## 开发与构建

### Windows Web MVP

浏览器版先安装 Bun、Go 和本机 Chrome，然后在仓库根目录启动：

```powershell
.\scripts\start-local.ps1
.\scripts\start-local.ps1 -Action Status
```

访问 `http://localhost:1010`。脚本将前后端绑定本机地址，API 使用 `2010`，拒绝抢占已使用的端口；进程隐藏运行，关闭终端后仍可继续预览。数据保存在 `.local/project-workbench-debug`，日志和进程记录在 `.local/web-mvp`，Go 缓存在 `.local/cache`。停止只回收本脚本登记的进程树，保留数据：

```powershell
.\scripts\start-local.ps1 -Action Stop
```

使用正式 Web 构建产物验收：

```powershell
Push-Location web
bun run build
Pop-Location
.\scripts\start-local.ps1 -Preview
Push-Location web
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
bun run test:web:mvp
Pop-Location
```

切换开发和预览模式前先停止已有服务。自动验收仅编辑新建的测试画布，覆盖便签、撤销重做、数据库保存、故障草稿恢复、工具栏、技能详情及拖动障碍即时绕线，截图与结果保存在 `.local/web-mvp-evidence`。它会保留验收画布，不删除既有项目。

此启动方式不打包助手宿主，也不配置模型凭据。助手对话和付费生成需要另外完成运行时及模型配置；技能库的浏览不以模型调用为前提。浏览器关闭页签依靠缓存、未保存提醒和离开页面刷新保存，浏览器不会保证等待网络请求完成；原生 Wails 关闭屏障单独按下文验收。

### Wails 开发

统一浏览器预览与 Wails dev（共用 `web/src`、Vite `1010` 和本地 Go API `2010`）：

```bash
./scripts/huabu-shared-dev.sh
```

脚本会为本次开发会话生成一个临时桌面令牌，并让 Vite 代理自动转发到同一个 Go 后端；生产包仍使用随机令牌和动态 loopback 端口。

前端检查：

```bash
cd web
bun test test/local-workspace-bootstrap.test.ts test/local-project-library.test.ts test/local-generation-pipeline.test.ts
bun run build
```

后端检查：

```bash
cd backend
go test ./internal/bootstrap ./internal/handler ./cmd/desktop -count=1
```

构建 macOS 桌面包：

```bash
cd backend/cmd/desktop
go run github.com/wailsapp/wails/v2/cmd/wails@v2.16.0 build -clean -m -nosyncgomod
```

产物位于：

```text
backend/cmd/desktop/build/bin/Huabu.app
```

## 手工验收清单

1. 启动新数据目录，首页直接进入本地工作区，不出现登录/注册页面。
2. 创建画布，添加节点并保存；退出后使用同一数据目录重启，项目和节点仍存在。
3. 打开项目库，验证搜索、文件夹、重命名、移动、回收站恢复、ZIP 导入导出。
4. 打开“创作历史”，确认 `/tasks` 请求在无登录 Cookie 下返回成功。
5. 配置一个可用模型后，再验证生成任务的提交、轮询、结果写回画布和重启恢复。

桌面 profile 还会对共享画布和 Agent 入口做本地模式适配：共享画布返回本地工作区，Agent 不把登录 Cookie 当作本地工作区的启动条件。

## 原生窗口路由

Wails 2.16 生产包只把 `/` 和 `index.html` 交给前端运行时；深路径（例如 `/canvas/:id`）会落到资源 handler 并返回 404。原生窗口因此使用 hash 路由：刷新仍请求 `/`，画布地址形如 `/#/canvas/<id>`。浏览器部署继续使用 History 路径，`/api` 与媒体地址不进入 hash。

## 原生关闭保存协议

桌面窗口在前端完成工作区恢复并注册关闭监听后，通过 `CloseSaveReady()` 启用关闭屏障。启用之前允许退出，不能把启动期间的退出算作保存验收。

1. `OnBeforeClose` 暂停关窗，为本次关闭生成唯一请求 ID，发送 `huabu:before-close-save`。同一时刻只有一个原生关闭请求。
2. 前端先提交仍有焦点的标题输入，再显示模态保存反馈。模态期间画布及挂在页面外的浮层不能继续输入。
3. 当前编辑器提交实时节点、连线及工作区状态；随后等待画布、素材和模型配置落盘。本地工作区还会同步已经离开画布但仍未确认保存的修改，等待后端确认后才调用 `CompleteCloseSave(requestId, true)`。
4. 保存失败返回 `false`。原生对话框默认返回画布，用户可再次关闭以重试；用户明确选择直接退出时，提示未保存修改可能丢失。
5. 原生等待上限为 30 秒。超时先使旧确认失效，再发送 `huabu:close-save-timeout` 并提供返回画布或直接退出的选择。前端解除模态，但仍串行等待旧写入；重试会在旧写入结束后保存最新内容，迟到响应不能关闭窗口。

协议检查：

```powershell
# 在仓库根目录执行
Push-Location backend
go test ./cmd/desktop -run TestClose -count=1
Pop-Location
Push-Location web
bun test test/desktop-close.test.ts test/desktop-update.test.ts test/desktop-update-preparation.test.ts
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
bun test test/canvas-stage1.browser.test.ts test/canvas-lifecycle-restart.browser.test.ts test/canvas-leave-flush.browser.test.ts
Pop-Location
```

浏览器检查使用随机端口和模拟的原生接口、后端保存响应，覆盖成功、失败、超时、重试及重开。它不能证明 Wails 原生事件、系统对话框和操作系统关窗行为已经通过。

原生验收需要先按发行构建脚本生成包含最新前端的桌面包，并使用隔离数据目录。逐项检查：便签和标题编辑后立即关窗、同目录重开恢复；后端写入失败或超时后默认保留窗口；继续修改后重试关闭；明确放弃保存退出；连续关窗不会跳过屏障。强制结束进程不触发该协议，应另验已落盘草稿的恢复范围。

只跳过前端执行的 Wails 编译用于确认 Go 和绑定可编译；其嵌入资源可能陈旧，不可用于上述原生验收，也不可作为发行完成证据。

## 历史 macOS 验收记录

- 统一开发脚本已验证：Wails 日志显示 `Frontend DevServer URL: http://127.0.0.1:3000`；浏览器代理和后端直连的 `/api/health/live` 返回相同 `dev` 构建信息；`/api/workspace/bootstrap` 经浏览器代理返回 HTTP 200。（记录时为 `3000`/`8080`，本地端口后来已切换为 `1010`/`2010`。）

- Wails 2.16.0 生产包已重新构建并自签名，产物为 `backend/cmd/desktop/build/bin/Huabu.app`。
- `go test ./internal/handler ./internal/bootstrap ./cmd/desktop -count=1` 通过。
- 协议定向测试通过。
- 重新打开 `.app` 后，桌面进程正常运行并进入本地工作区；手工创建“本地验收画布”、退出并重启后，项目库仍显示该画布，且显示“已加载全部 2 个画布”。

模型 API Key 只在本地工作区配置中使用；当前仓库不提供默认 Key，也不会把 Key 写入代码或测试夹具。
