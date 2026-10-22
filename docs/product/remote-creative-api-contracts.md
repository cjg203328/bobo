# 波波 AI 画布远端创作 API 与事件合同

## 状态与范围

本文定义远端数据底座、Agent 创作、长任务和账务之间的稳定边界，供分阶段实现与验收。当前 cloud profile 仍是内部试用：已有 `/api/auth/*`、`/api/workspace/bootstrap`、用户归属的 `/api/canvas-projects/*`、`document-commit` 和 `/api/resources/*`；Agent 云端运行、持久生成任务、商业报价和账务端点尚未实现。本文描述的后续端点与事件不得据此视为已经交付。

当前 `/api` 保持试用兼容。商业化合同按 `/api/v1` 发布；正式切换前提供迁移窗口或兼容代理，不在已有客户端仍依赖试用路由时直接改写路径。

## 通用约定

- 身份只从已验证的服务端会话解析。请求体中的 `userId`、`tenantId`、角色和价格不能授予权限；资源访问按当前租户成员关系重新鉴权。
- 成功响应保持统一 envelope：`{ "code": 200, "data": ..., "msg": "ok" }`。错误包含稳定 `reason`、可读 `msg` 和可选 `details`；客户端不得依赖可变的错误文案分支。
- 每次写请求接受 `X-Request-ID` 或由服务端生成 `requestId`；跨 Agent、任务、画布和账务写入传递 `traceId`、`correlationId` 与 `causationId`。
- 会创建任务、改变画布或修改账本的请求必须带 `Idempotency-Key`。相同 key 与规范化请求体返回同一业务结果；相同 key 搭配不同请求体返回 `409 idempotency_conflict`。
- 画布写入必须带 `expectedRevision`。成功写入只增加一个修订号；旧版本写入返回 `409 revision_conflict` 和当前 revision，不静默覆盖。
- 素材和生成结果以不可变 `assetId`/`resourceId` 引用；短时下载地址不作为持久引用。服务端校验资源归属、状态和用途。
- 时间为 UTC RFC 3339。金额以整数最小货币单位或整数积分表示，禁止浮点金额。

## 资源与 API

| 领域 | 主要合同 | 写入约束 |
| --- | --- | --- |
| 身份与空间 | `POST /api/v1/auth/register`、`login`、`logout`；`GET /api/v1/auth/session`；`GET /api/v1/workspace/bootstrap` | HttpOnly 会话 Cookie；所有变更请求校验 CSRF；登出撤销服务端 session |
| 项目与画布 | `GET /api/v1/projects`；`GET /api/v1/canvas-projects/{canvasId}`；`POST /api/v1/canvas-projects/{canvasId}/document-commits`；`GET /api/v1/canvas-projects/{canvasId}/events?after={cursor}` | 所有资源按当前用户/租户授权；文档提交使用幂等键和 `expectedRevision` |
| 素材 | `POST /api/v1/assets/uploads`；`POST /api/v1/assets/uploads/{uploadId}/complete`；`GET /api/v1/assets/{assetId}`；`GET /api/v1/assets/{assetId}/download` | 先申请短时上传授权，再完成回执和内容校验；文件字节、MIME、哈希、大小、所有者和存储状态必须绑定 |
| Agent | `POST /api/v1/agent/conversations`；`POST /api/v1/agent/conversations/{conversationId}/messages`；`GET /api/v1/agent/runs/{runId}`；`POST /api/v1/agent/runs/{runId}/confirm`；`POST /api/v1/agent/runs/{runId}/cancel` | 消息写入有幂等键；run 记录场景版本、授权技能版本、输入资源 ID 和源画布 revision；会产生费用的提案须先报价并由用户确认 |
| 任务 | `POST /api/v1/tasks`；`GET /api/v1/tasks/{taskId}`；`GET /api/v1/tasks?cursor={cursor}`；`POST /api/v1/tasks/{taskId}/cancel`；`GET /api/v1/tasks/{taskId}/events?after={cursor}` | 只接受已确认的 Agent 提案和有效额度预占；创建、取消、回调与结果登记幂等；客户端重连可从 cursor 恢复 |
| 报价与账务 | `POST /api/v1/quotes`；`POST /api/v1/billing/reservations`；`POST /api/v1/billing/reservations/{reservationId}/settle`；`POST /api/v1/billing/reservations/{reservationId}/release`；`GET /api/v1/billing/ledger` | Quote 固定价格表版本、输入摘要、数量、有效期和总额；预占、结算、释放均写不可变账本并带唯一业务键 |

远端内部试用继续使用现有 `/api` 路由，当前阶段只验收身份、空间、项目/画布和素材。向 `/api/v1` 迁移需在路由与 OpenAPI 一起发布；两个合同版本要有明确的兼容截止日期。

## 状态合同

### Agent run

```text
accepted -> clarifying -> proposed -> awaiting_confirmation -> executing
                                                    |               |
                                                    |               +-> waiting_for_task -> completed
                                                    |                                      -> failed
                                                    +-> cancelled
```

Agent run 保存 `runId`、`conversationId`、`sceneId`/`sceneVersion`、`skillRefs[]`、`inputAssetIds[]`、`sourceCanvasId`/`sourceRevision`、状态、事件 cursor 和脱敏错误分类。只有确认的提案可以请求任务创建；同一 run 不得因浏览器重试重复确认或重复创建任务。澄清状态允许等待用户，服务端重启后仍可恢复。

### Generation task

```text
queued -> preparing -> running -> succeeded
                      |         -> failed
                      |         -> cancelling -> cancelled
                      +-> retry_wait -> preparing
```

每个任务保存稳定 `taskId`、`runId`、逻辑能力和模型配置快照、输入资源摘要、`sourceCanvasRevision`、`reservationId`、进度、尝试次数、结果 `assetIds[]` 和终态。供应商作业 ID、凭据和原始回调不返回客户端。未知提交结果进入可查询的 `reconciling` 状态，不盲目重新提交。

### Canvas

画布文档提交接收完整规范化文档、`expectedRevision` 和幂等键；服务端只负责 CAS、归属校验、修订历史和操作回执。Agent 生成结果先登记为素材，再以独立文档提交将结果节点与来源关系写入画布。提交冲突时保留生成素材和客户端草稿，要求重新读取或合并后再写入。

### Billing

Quote 是短时有效、不可变的用户报价快照。确认时在同一账务事务内创建唯一 reservation；任务成功按最终用量结算，多退少补受限于 quote 授权上限；确定失败或取消按策略释放/退款。供应商用量以独立成本记录对账，不直接修改用户账本。退款是新的反向账本记录，不删除历史扣费。

## 事件 envelope

所有领域事件通过事务 outbox 产生，先提交业务状态和 outbox，再异步投递。投递为至少一次；消费者按 `eventId` 去重，并按同一 `aggregateId` 的 `sequence` 排序。UI 可用 SSE/WebSocket 订阅并通过 `Last-Event-ID` 或 `after` cursor 恢复；事件不能携带凭据、完整提示词、原始文件或供应商密钥。

```json
{
  "eventId": "evt_01J...",
  "eventType": "task.succeeded",
  "schemaVersion": 1,
  "occurredAt": "2026-10-23T00:00:00Z",
  "tenantId": "ten_...",
  "actorId": "usr_...",
  "aggregateType": "task",
  "aggregateId": "task_...",
  "sequence": 7,
  "requestId": "req_...",
  "traceId": "trace_...",
  "correlationId": "run_...",
  "causationId": "evt_...",
  "data": {}
}
```

首批事件名固定为：

- Agent：`agent.run.accepted`、`agent.run.clarification_required`、`agent.proposal.ready`、`agent.proposal.confirmed`、`agent.run.completed`、`agent.run.failed`、`agent.run.cancelled`。
- 任务：`task.accepted`、`task.progressed`、`task.retry_scheduled`、`task.succeeded`、`task.failed`、`task.cancelled`、`task.reconciled`。
- 画布：`canvas.document.committed`、`canvas.document.conflicted`、`canvas.asset.attached`。
- 账务：`billing.quote.issued`、`billing.credit.reserved`、`billing.credit.settled`、`billing.credit.released`、`billing.refund.issued`、`provider.usage.recorded`、`provider.usage.reconciled`。

事件名和字段采用只增不改规则；破坏性变更提升 `schemaVersion` 并提供消费者迁移期。每个事件包含最小可投影字段和关联 ID，客户端需要完整状态时仍通过相应资源 GET 端点读取权威记录。

## 阶段验收

1. 远端数据底座：双浏览器创建/登录、创建画布、连续修订、上传素材、另一会话恢复、隔离拒绝、CSRF 拒绝和登出撤销；对 PostgreSQL 与持久素材卷执行部署测试。
2. Agent 封闭测试：选定商品宣传图场景，用真实模型验证澄清、提案、确认、run 重开、任务恢复、重复消息幂等和结果回画布继续编辑。
3. 付费测试版：逐条核对 quote 快照、reservation、成功结算、失败释放/退款、幂等重试、账本余额和供应商对账。
4. 客户端候选与商业发布：分别验收离线草稿/崩溃恢复/导出删除，以及容量、安全、告警、备份和故障演练。

任何阶段都不能以页面可打开、路由存在或模拟供应商通过代替上述用户流程验收。
