# 波波 AI 画布远端内部试用

此部署用于验证账号、个人云空间、项目/画布和素材的远端保存与恢复。它是单实例内部试用配置，不是生产发布配置。

## 启动

1. 复制 `.env.cloud.example` 为 `.env.cloud`，将 `POSTGRES_PASSWORD` 替换为唯一随机值。连接串中密码应使用字母、数字、连字符或下划线；可用 `openssl rand -hex 32` 生成。
2. 本机访问保持 `CANVAS_AUTH_COOKIE_SECURE=false` 和 `CANVAS_CORS_ORIGINS=http://localhost:1010`。部署到 HTTPS 域名时设置 `CANVAS_AUTH_COOKIE_SECURE=true`，并把 CORS 来源改成完整站点源，例如 `https://canvas.example.com`。
3. 启动服务：

   ```powershell
   docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d --build
   ```

4. 打开 `http://localhost:1010`，创建账号并进入云端工作区。PostgreSQL 数据保存在 `cloud-database` 卷，素材文件保存在 `cloud-backend-data` 卷。

## 内部试用验收

1. 浏览器 A 注册账号，创建项目和画布，连续编辑并保存多次，上传一份图片或文件。
2. 重放同一个文档提交幂等键，确认不会重复增加 revision；用旧 revision 写入应返回冲突且不覆盖新内容。
3. 浏览器 B 登录同一账号，确认项目、最新画布 revision 和素材均可读取，并能继续编辑保存。
4. 使用另一个账号确认不能读取项目和素材，也不能通过文档提交路由覆盖画布。
5. 写请求缺少或伪造 CSRF 时应被拒绝；退出登录后原会话立即失效。
6. 逐项核对 `docs/product/remote-creative-api-contracts.md` 中的当前 API 边界，不把尚未实现的 Agent、任务和账务合同当成已开放功能。

## 当前边界

- 当前素材落在单个后端容器的持久卷，未接入对象存储直传、跨区复制或备份恢复；更换/丢失该卷会造成素材不可用。
- 账号是内部试用账号，没有邮箱验证、密码重置和生产级账号滥用治理。
- cloud profile 暂不开放模型供应商调用、Agent 云端运行和商业扣费；这些链路须按 PRD 后续阶段完成后再开放。
- 自动建表仅用于内部试用。正式环境应使用版本化数据库迁移，并演练备份、恢复和回滚。
