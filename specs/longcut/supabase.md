# LongCut 项目 Supabase 集成清单

> 分析对象：`vendors/longcut/`
> 目的：列出 LongCut 集成了 Supabase 的所有功能点，每项用 1-2 句话清晰说明。

---

## ✅ 已集成的功能点

### 1. Supabase Auth（身份认证）
管理用户的注册、登录、会话和登出。支持邮箱/密码（含邮件确认链接）和 Google OAuth 登录。

### 2. Supabase 内置邮件服务
注册确认邮件、密码重置等由 Supabase Auth 自身的 SMTP 发送，业务代码无需介入（注意：欢迎邮件走 Postmark，是另一套）。

### 3. Postgres 数据库（核心存储）
存放所有业务数据，共 11 张表（用户资料、视频分析、笔记、订阅、审计日志等），通过 `supabase.from(...)` 增删改查。

### 4. RLS 行级安全策略
数据库自动给每个查询追加 `WHERE auth.uid() = user_id` 类的过滤，保证用户只能看到/改自己的数据，应用代码写错也不会泄露。

### 5. RPC（数据库存储过程）
把多步操作封装到 Postgres 函数里，由 `supabase.rpc(...)` 调用，主要用于原子化积分扣减、防竞态的 upsert 等需要事务保证的场景。

### 6. Database Triggers（数据库触发器）
新用户注册时自动创建 `profiles` 行、自动排队欢迎邮件、自动维护 `updated_at` 时间戳——这些都在数据库内部触发，应用代码无需关心。

### 7. `@supabase/ssr` SSR 会话管理
让 Next.js 服务端组件、API Routes 和中间件都能通过 HttpOnly cookie 读到当前用户身份，并自动刷新过期的 JWT。

### 8. Service Role 服务角色客户端
持有"超级管理员密钥"绕过 RLS，专门用于无用户会话的场景：Stripe webhook、欢迎邮件回调、邮件退订链接、运维脚本。

### 9. pg_cron（数据库定时任务）
Postgres 内置定时调度器，用来定期扫 `pending_welcome_emails` 表，触发欢迎邮件发送流程，无需外部 cron 服务。

### 10. pg_net（数据库内 HTTP 客户端）
让 Postgres 函数可以直接发 HTTP 请求，pg_cron 通过它调用 `/api/email/send-welcome` 接口，把数据库事件桥接到 Next.js 业务逻辑。

### 11. Supabase Vault（密钥保管）
在数据库内部加密存储敏感配置（如 `app_url`、`internal_api_key`），供 pg_net 在调用外部 API 时安全读取，避免硬编码。

### 12. `auth.uid()` 内置函数
Postgres 中读取当前请求 JWT 里用户 ID 的内置函数，是所有 RLS 策略的核心，把"登录用户"和"数据行"自动绑定起来。

---

## ❌ 未集成的功能点

### Supabase Storage
项目不存任何文件，视频缩略图直接引用 YouTube CDN，AI 生成的图片走 Gemini API。

### Supabase Realtime
没有 WebSocket 订阅，所有数据更新通过 HTTP 请求和轮询完成。

### Supabase Edge Functions
所有服务端逻辑用 Next.js API Routes 实现，没有 `supabase/functions/` 目录。

---

## 一句话概括

LongCut **深度使用** Supabase 的 Auth + Postgres（含 RLS、RPC、触发器、pg_cron、pg_net、Vault）+ SSR 会话集成；**完全不用** Storage、Realtime、Edge Functions——这三块由 YouTube CDN、轮询、Next.js API Routes 替代。
