# 波波 AI 画布模块地图与验收边界

## 产品模块

| 模块 | 用户价值 | 主要代码区域 | MVP 验收重点 |
| --- | --- | --- | --- |
| Agent 对话 | 用自然语言描述目标，获得澄清、方案和后续操作 | `web/src/pages/canvas`、`agent-host`、`backend/internal/agentops` | 多轮消息、附件/画布引用、提案确认、失败恢复 |
| 提示词中心 | 反推、优化、比较和管理提示词版本 | `web/src/pages/canvas`、`web/src/lib`、`backend/internal/agentops` | 不覆盖原文、可编辑、可采纳、无模型时给出原因 |
| 图片生成 | 从文字、参考图和画布上下文生成图片 | `web/src/services`、`backend/internal/generation`、`backend/internal/provider` | 任务状态、参考素材、结果入库和重试 |
| 视频生成 | 从创意、分镜或首帧生成视频 | `web/src/services`、`backend/internal/generation` | 长任务、取消、进度、失败和结果回填 |
| 图片细化 | 全图衍生、局部蒙版、表情/材质调整和尺寸处理 | `web/src/components/canvas`、`web/src/lib/canvas` | 源图保留；不支持蒙版的模型拒绝执行 |
| 画布 | 组织便签、文本、图片、视频、音频和生成节点 | `web/src/components/canvas`、`web/src/stores/canvas`、`web/src/lib/canvas` | 移动、连线避障、便签保存、撤销/重做、恢复 |
| Skill | 让 Agent 按版本调用专业创作能力 | `agent-host`、`backend/internal/skills`、`plugin-packages` | 内置 Skill 可见、版本固定、权限拒绝可解释 |
| 项目与素材 | 保存项目、参考素材、生成结果和引用关系 | `backend/internal/project`、`backend/internal/asset`、对应前端页面 | 归属校验、上传回执、删除保护、恢复 |
| 模型与任务 | 配置渠道、查看任务生命周期和运行成本 | `backend/internal/modelcatalog`、`backend/internal/task` | 配置有效性、排队/运行/成功/失败状态 |
| 远端商业化 | 跨设备访问、套餐、额度、账单和审计 | 规划中的远端服务 | 账号隔离、预占/结算/退款、导出删除 |

## 验收分层

### P0：Web MVP 必须通过

- 首页只展示波波 AI 画布及其 Agent 创作入口。
- 从一句话或场景卡进入对话，能附加参考并形成可编辑提案。
- 反推、优化、图片细化都有明确的输入、候选结果和用户采纳动作。
- 画布便签编辑、撤销/重做、保存、失败草稿和重开恢复可验证。
- 生成任务必须经过确认，状态和失败原因可见。

### P1：打包客户端前必须通过

- 原生关窗保存、失败草稿和重开恢复。
- 任务在客户端关闭后继续运行，重新打开可读服务端状态。
- 技能入口、模型配置、渠道连接和本地兼容协议回归。
- 安装包、升级和数据目录迁移不再出现旧品牌公开文案。

### P2：商业化版本

- 远端项目/画布版本、对象存储、账号/租户权限。
- 套餐与操作报价、额度预占、成功结算、失败退款和账单明细。
- 团队协作、审批、共享 Skill 和实时协同画布。

## 证据规则

文档中“已有实现依据”表示代码、测试或接口合同可定位；只有通过对应场景的真实回归后，才能标记为“已验收”。供应商目录存在不代表真实模型可用，局部测试通过也不能替代端到端验收。
