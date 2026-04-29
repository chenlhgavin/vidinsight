# LongCut 部署方案

> 基于 `vendors/longcut` 源码梳理的完整部署方案，覆盖本地开发、预览（Preview）、生产（Production）三类环境，以及配套的 Supabase / Stripe / AI Provider / Postmark 等外部依赖、CI/CD、安全与运维要点。

---

## 1. 部署目标与运行形态

LongCut 是 **Next.js 15 (App Router) + Turbopack** 的全栈 Web 应用，所有后端能力均以 **Route Handlers** 方式存在（`app/api/**/route.ts`），不存在独立的 Node 服务进程。整体部署形态遵循「Serverless 前端/边缘 + 托管数据库 + 第三方 SaaS」的拓扑：

- 主推：**Vercel**（与 Turbopack、`@vercel/analytics`、CSP / HSTS、`middleware.ts`、`sitemap.ts`、`robots.ts` 直接对齐）
- 可选：任意支持 Next.js 15 standalone 输出的容器/PaaS（自建 Node 20 + 反向代理）
- 数据 / 认证：**Supabase**（PostgreSQL + Auth + RLS + Storage）
- 计费：**Stripe**（Checkout / Customer Portal / Webhook）
- 邮件：**Postmark**（事务邮件、Newsletter）
- AI：MiniMax / xAI Grok / Google Gemini，REST 直连，无独立后端服务

```
                       ┌──────────────────────────────┐
                       │       End User Browser        │
                       │  (YouTube IFrame + UI + RSC)  │
                       └──────────────┬───────────────┘
                                      │ HTTPS (CSP/HSTS)
                                      ▼
                       ┌──────────────────────────────┐
                       │   Vercel Edge / Node Runtime │
                       │   - middleware.ts (CSP/CSRF) │
                       │   - app/api/**  Route Handler│
                       │   - app/**  RSC + Client     │
                       └─────┬─────────┬──────┬───────┘
                             │         │      │
            ┌────────────────┘         │      └─────────────────────┐
            ▼                          ▼                            ▼
   ┌────────────────┐      ┌────────────────────┐       ┌──────────────────────┐
   │   Supabase     │      │   AI Providers     │       │      Stripe          │
   │ Postgres+Auth  │      │ MiniMax/Grok/Gemini│       │ Checkout/Portal/WH   │
   │  RLS/Storage   │      │ Google Translate   │       │                      │
   └────────────────┘      └────────────────────┘       └──────────────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │   YouTube oEmbed / 字幕轨    │
                       └──────────────────────────────┘

                       ┌──────────────────────────────┐
                       │           Postmark           │
                       │    事务邮件 / Newsletter     │
                       └──────────────────────────────┘
```

---

## 2. 环境分层

LongCut 源码本身无独立的 `staging` 配置，部署时建议三层结构（与 Vercel + Supabase Branching 天然契合）：

| 环境 | 用途 | 代码源 | Supabase | Stripe | 域名 |
| --- | --- | --- | --- | --- | --- |
| Local Dev | 个人开发 | 工作区 | 远端 dev 项目 / 本地 Supabase CLI | Test Mode | `http://localhost:3000` |
| Preview | PR 预览 / 集成验证 | PR 分支 | Supabase Preview Branch（自动） | Test Mode | Vercel 自动子域名 |
| Production | 线上 | `main` | 生产 Supabase 项目 | Live Mode | 自有域名（HTTPS） |

```
           Local Dev                   Preview                    Production
        ┌────────────┐             ┌────────────┐              ┌────────────┐
        │ next dev   │             │ Vercel PR  │              │ Vercel Prod│
        │ Turbopack  │             │ Build+Edge │              │ Build+Edge │
        └─────┬──────┘             └─────┬──────┘              └─────┬──────┘
              │ .env.local               │ env preset                │ env preset
              ▼                          ▼                           ▼
       Supabase Dev              Supabase PR Branch           Supabase Prod
       Stripe Test               Stripe Test                  Stripe Live
       AI Test Keys              AI Shared Keys               AI Prod Keys
```

---

## 3. 先决条件（一次性准备）

- Node.js **20.x**（`@types/node@^20`，与 Next.js 15 / `tsx` / `dotenv` 适配）
- 包管理器：仓库同时存在 `package-lock.json` 与 `pnpm-lock.yaml`，**生产构建建议固定一种**；本文以 `npm ci` 为主，pnpm 等价。
- Supabase 项目（含 Service Role Key、SQL 编辑权限）
- Stripe 账号（Test + Live），并启用 Customer Portal
- 至少一个 AI Provider Key（推荐 `MINIMAX_API_KEY`），可选 `XAI_API_KEY` / `GEMINI_API_KEY`
- Postmark 账号（事务邮件 + Server Token）
- 域名 + DNS 接入 Vercel（生产）

---

## 4. 环境变量矩阵

来源：`.env.example` / `.env.local.example` / `scripts/validate-env.ts` / `middleware.ts`。

### 4.1 必填

| 变量 | 用途 | 备注 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 同时影响 `middleware.ts` 中的 CSP `connect-src` 白名单 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器端 Supabase 匿名密钥 | RLS 必须配置 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端管理员密钥 | `lib/supabase/admin.ts` / Webhook / 后台脚本使用 |
| `CSRF_SALT` | CSRF Token 签名盐 | `openssl rand -base64 32`，**生产必须 ≥ 32 字节随机值** |
| `STRIPE_SECRET_KEY` | Stripe 服务端密钥 | `sk_live_*`（生产）/ `sk_test_*`（开发） |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 浏览器端公钥 | `pk_*`，必须与 secret key 同模式 |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 校验 | `whsec_*` |
| `STRIPE_PRO_PRICE_ID` | Pro 订阅 Price ID | `price_*` |
| `STRIPE_TOPUP_PRICE_ID` | 充值 Price ID | `price_*` |

### 4.2 推荐 / 高频可选

| 变量 | 默认 / 推荐值 | 说明 |
| --- | --- | --- |
| `AI_PROVIDER` | `minimax` | 服务端文本 Provider 路由 |
| `NEXT_PUBLIC_AI_PROVIDER` | `minimax` | 与 `AI_PROVIDER` 保持一致 |
| `AI_DEFAULT_MODEL` | `MiniMax-M2.7` | 模型覆盖 |
| `MINIMAX_API_KEY` | — | 默认文本 Provider |
| `MINIMAX_API_BASE_URL` | — | 自托管 / 备用网关 |
| `XAI_API_KEY` | — | 可选 Grok |
| `GEMINI_API_KEY` | — | `app/api/generate-image` 必需；亦可作为文本 Provider |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` | 影响 OAuth 重定向、邮件链接、`sitemap.ts` |
| `NEXT_PUBLIC_AI_MODEL` | `MiniMax-M2.7` | 仅 UI 展示 |
| `NEXT_PUBLIC_ENABLE_TRANSLATION_SELECTOR` | `false` | 翻译下拉特性开关 |
| `YOUTUBE_API_KEY` | — | 增强元信息抓取 |
| `UNLIMITED_VIDEO_USERS` | — | 逗号分隔，登录用户邮箱 / UID 白名单 |

### 4.3 校验

构建/部署前统一执行：

```bash
npm run validate-env
```

`scripts/validate-env.ts` 校验项：
- Supabase 三件套 + Stripe 五件套
- AI Provider Key 与 `AI_PROVIDER` 一致性
- Stripe Key 前缀（`sk_` / `pk_` / `whsec_` / `price_`）与 test/live 模式一致性
- Stripe Customer Portal 是否已配置（否则提示 `npm run stripe:setup-portal`）

---

## 5. Supabase 部署

### 5.1 数据库迁移

`supabase/migrations/` 目录提供 16 个 SQL 文件，必须按文件名时间序应用：

```
20241107000000_initial_schema.sql
20251031120000_phase1_stripe_schema.sql
20251101120000_phase4_backend_updates.sql
20251101120001_add_audit_and_rate_limit_tables.sql
20251101120002_atomic_credit_consumption.sql
20251101120003_backfill_existing_users.sql
20251123090000_image_generation_limits.sql
20251202120000_analytics_dashboard.sql
20251210120000_add_language_columns.sql
20251211185543_add_newsletter_subscription.sql
20251214185226_security_ownership.sql
20260110120000_welcome_email_system.sql
20260116120000_fix_update_video_analysis_overload.sql
20260121120000_fix_duplicate_credit_consumption.sql
20260122120000_fix_missing_user_videos.sql
20260221120000_fix_video_save_transaction.sql
```

推荐方式（CLI）：

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push          # 生产
# Preview Branch 由 GitHub PR 自动开启；合并/关闭后由
# .github/workflows/cleanup-supabase-branch.yml 自动删除
```

或在 Supabase SQL Editor 手动按序粘贴执行。

### 5.2 Auth 配置

- 启用 Email/Password，按需启用 OAuth Provider
- Redirect URL 必须包含 `NEXT_PUBLIC_APP_URL`（含 Preview 子域名通配）
- Email Template 中的链接基址应与生产域名一致
- 必要时调高 JWT 有效期（默认即可），`middleware.ts` 已处理失效 refresh token 清理

### 5.3 Storage / RLS

- 所有用户数据表（`video_analyses`、`user_videos`、`notes`、`profiles`、`rate_limit_logs` 等）均通过 RLS 控制访问；Service Role Key 仅服务端使用，**严禁泄漏到浏览器**
- `lib/supabase/admin.ts` 使用 Service Role 进行 Webhook、后台脚本写入

```
   ┌────────────────────────────────────────────────────┐
   │              Supabase Project                      │
   │  ┌────────────┐   ┌────────────┐   ┌────────────┐ │
   │  │   Auth     │   │  Postgres  │   │  Storage   │ │
   │  │ (sessions) │   │  + RLS     │   │ (images)   │ │
   │  └─────┬──────┘   └─────┬──────┘   └────────────┘ │
   └────────┼────────────────┼─────────────────────────┘
            │ ssr cookie     │ anon (browser) / service (server)
            ▼                ▼
        Browser         Route Handlers
```

---

## 6. Stripe 部署

### 6.1 一次性配置

```bash
npm run stripe:create-prices       # 创建 Pro / Topup Price
npm run stripe:setup-portal        # 初始化 Customer Portal 配置
npm run stripe:smoke               # 冒烟测试关键链路
```

### 6.2 Webhook

- Endpoint：`https://<NEXT_PUBLIC_APP_URL>/api/webhooks/stripe`
- 关键事件：`checkout.session.completed`、`customer.subscription.*`、`invoice.*`
- `app/api/webhooks/stripe/route.ts` 强制 `runtime = 'nodejs'`、`dynamic = 'force-dynamic'`
- `middleware.ts` 的 `matcher` 已显式排除 `api/webhooks`，保证原始 body 不被改写
- 失败重试：依赖 Stripe 自带重试 + 自研幂等锁（`lockStripeEvent`，依赖审计表）

```
  Stripe ─signed event─►  /api/webhooks/stripe (Node runtime, raw body)
                              │
                              │ verify signature (STRIPE_WEBHOOK_SECRET)
                              ▼
                        lockStripeEvent (dedupe)
                              │
                              ▼
                  dispatch → SubscriptionManager / Topup / AuditLogger
                              │
                              ▼
                  Supabase (service role) writes
```

### 6.3 模式一致性

`validate-env.ts` 会比对 `STRIPE_SECRET_KEY` 与 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 的 test/live 字段，**生产环境必须全部为 live**。

---

## 7. AI Provider 部署

- 默认链路：`AI_PROVIDER=minimax` + `MINIMAX_API_KEY`，模型 `MiniMax-M2.7`
- 适配层：`lib/ai-providers/{registry,provider-config,minimax-adapter,grok-adapter,gemini-adapter}.ts`
- Provider 选择优先级：显式 `AI_PROVIDER` → 凭据自动回退 → 错误退化（`safePromise`）
- 超时与重试由各 adapter 内部处理；上层使用 `AbortManager` 取消未完成请求
- **生产建议**：至少配置 1 个主 Provider + 1 个回退 Provider，避免单点
- 图像生成（`/api/generate-image`）独立依赖 `GEMINI_API_KEY`

---

## 8. 邮件 / Newsletter

- `Postmark` Server Token 通过环境变量注入（仓库内未列入 `.env.example` 必填项，按需补充）
- 模板：`lib/email/templates/`
- API：`/api/email/send-welcome`、`/api/newsletter/*`
- Newsletter 群发：`scripts/send-newsletter.ts` / `scripts/send-test-newsletter.ts`（一次性 / 定时任务）

---

## 9. 本地开发部署

```
┌──────────────────────────────────────────────────────────┐
│ 1. 克隆仓库                                              │
│    git clone <repo> && cd vendors/longcut                │
│                                                          │
│ 2. 安装依赖                                              │
│    npm ci          # 或 pnpm install --frozen-lockfile   │
│                                                          │
│ 3. 配置环境                                              │
│    cp .env.local.example .env.local                      │
│    # 填入 Supabase / AI / Stripe / CSRF_SALT             │
│    npm run validate-env                                  │
│                                                          │
│ 4. 数据库                                                │
│    supabase login && supabase link --project-ref <id>    │
│    supabase db push                                      │
│                                                          │
│ 5. Stripe（仅首次）                                      │
│    npm run stripe:create-prices                          │
│    npm run stripe:setup-portal                           │
│    stripe listen --forward-to localhost:3000/api/...     │
│                                                          │
│ 6. 启动                                                  │
│    npm run dev      # http://localhost:3000              │
│    npm run lint     # 可选                               │
└──────────────────────────────────────────────────────────┘
```

注意：
- `next dev --turbopack` 即热更新；`*.svg` 走 `@svgr/webpack`
- 默认 `NEXT_PUBLIC_APP_URL=http://localhost:3000`，Supabase OAuth 重定向需匹配
- 限流记录在 `rate_limit_logs`，本地测试时可手动清理

---

## 10. 生产部署（Vercel 推荐路径）

### 10.1 整体流程

```
 git push origin main
        │
        ▼
 ┌────────────────────────┐
 │  GitHub `main` branch  │
 └──────────┬─────────────┘
            │ webhook
            ▼
 ┌────────────────────────┐      ┌────────────────────────┐
 │   Vercel Build         │      │  Supabase Migrations   │
 │   - npm ci             │◄────►│  supabase db push      │
 │   - npm run build      │      │  (CI 或手动触发)       │
 │     (next build        │      └────────────────────────┘
 │      --turbopack)      │
 │   - 生成 .next/        │
 └──────────┬─────────────┘
            │
            ▼
 ┌────────────────────────┐
 │  Vercel Deploy         │
 │  - Edge: middleware.ts │
 │  - Node: API routes    │
 │  - Static: .next/static│
 │  - 注入 ENV            │
 └──────────┬─────────────┘
            │ DNS 切换
            ▼
 ┌────────────────────────┐
 │  Production Domain     │
 │  HTTPS + HSTS + CSP    │
 └────────────────────────┘
```

### 10.2 步骤清单

1. **导入项目**：Vercel → New Project → 选择仓库（Root Directory 指向 `vendors/longcut` 或将 `longcut` 单独建仓）
2. **构建命令**：默认 `next build`（Turbopack 由 `package.json` 注入：`next build --turbopack`）；输出目录 `.next`
3. **Node 版本**：在 Vercel Project Settings → General → Node.js Version 选 **20.x**
4. **环境变量**：按 §4 矩阵分别为 `Production` / `Preview` / `Development` 注入；Production 全部使用 live 凭据
5. **域名**：绑定自有域名，启用自动 HTTPS；`middleware.ts` 在 `NODE_ENV=production` 自动添加 HSTS（`max-age=31536000`）
6. **Stripe Webhook**：在 Stripe Dashboard 配置生产 endpoint，复制 `whsec_*` 至 `STRIPE_WEBHOOK_SECRET`
7. **Supabase 迁移**：在发布前执行 `supabase db push`（或在 CI 中加 step）
8. **首次校验**：发布后访问 `/`、登录 → 分析视频 → 触发限流 → 触发付费 → 验收

### 10.3 中间件 / 路由特性

```
 Request ─────────────────────────────────────────────────┐
   │                                                       │
   ▼                                                       │
 middleware.ts (matcher 排除 api/webhooks, _next/static,   │
                _next/image, favicon.ico, 图片扩展名)       │
   │  ① updateSession() — Supabase cookie refresh          │
   │  ② 注入 CSP / HSTS / X-Frame / XCTO / Referrer /       │
   │     Permissions-Policy                                │
   ▼                                                       │
 Route Handler / RSC                                       │
   │  - withSecurity (CSRF / Rate Limit / Body Cap)         │
   │  - Zod 校验                                            │
   │  - Provider 路由 / Supabase / Stripe / Postmark        │
   ▼                                                       │
 Response (含安全头) ───────────────────────────────────────┘
```

### 10.4 Webhook 路由特殊性

- `runtime = 'nodejs'` —— Stripe 签名校验需要原始 body，Edge Runtime 不可用
- `dynamic = 'force-dynamic'` —— 禁用静态化
- **不要**为 `/api/webhooks/**` 添加额外的 body 解析中间件

---

## 11. 自托管部署（容器化备选）

如果不使用 Vercel，可基于 Node 20 自建：

```
┌────────────────────────────────────────────────────────┐
│  Dockerfile（参考）                                    │
│   FROM node:20-bookworm-slim AS deps                   │
│   WORKDIR /app                                         │
│   COPY package.json package-lock.json ./               │
│   RUN npm ci                                           │
│                                                        │
│   FROM node:20-bookworm-slim AS builder                │
│   WORKDIR /app                                         │
│   COPY --from=deps /app/node_modules ./node_modules    │
│   COPY . .                                             │
│   ENV NEXT_TELEMETRY_DISABLED=1                        │
│   RUN npm run build       # next build --turbopack     │
│                                                        │
│   FROM node:20-bookworm-slim AS runner                 │
│   WORKDIR /app                                         │
│   ENV NODE_ENV=production                              │
│   COPY --from=builder /app/.next ./.next               │
│   COPY --from=builder /app/public ./public             │
│   COPY --from=builder /app/node_modules ./node_modules │
│   COPY --from=builder /app/package.json ./             │
│   EXPOSE 3000                                          │
│   CMD ["npm", "start"]    # next start                 │
└────────────────────────────────────────────────────────┘
```

注意点：
- `next.config.ts` 当前未启用 `output: 'standalone'`，如果需要 distroless 镜像可手动开启并复制 `.next/standalone`
- `*.svg` 通过 Turbopack 的 `@svgr/webpack` 规则处理，构建机需要安装 `@svgr/webpack`（如未安装请先 `npm i -D @svgr/webpack`）
- 反向代理（Nginx / Caddy）需透传 `Host`、`X-Forwarded-Proto`、`X-Forwarded-For`，并保留 `/api/webhooks/stripe` 原始 body
- 自行实现 HTTPS / HSTS / 健康检查（`GET /` 200 即可）

```
 ┌──────────┐    ┌─────────────┐    ┌──────────────┐
 │  Client  │──►│   Nginx /   │──►│  Next.js 容器 │
 │          │   │   Caddy     │   │  (next start) │
 └──────────┘   │  + HTTPS    │   │  Node 20      │
                └─────────────┘   └───────┬───────┘
                                          │
                            ┌─────────────┴─────────────┐
                            ▼                           ▼
                       Supabase                 AI / Stripe / Postmark
```

---

## 12. CI/CD

### 12.1 现有 GitHub Actions

| Workflow | 触发 | 作用 |
| --- | --- | --- |
| `.github/workflows/claude.yml` | issue / PR comment / review 含 `@claude` | 调用 `anthropics/claude-code-action@v1`，自动响应代码评审 |
| `.github/workflows/cleanup-supabase-branch.yml` | PR 关闭 | 通过 Supabase CLI 删除对应预览分支（`project-ref` 已硬编码） |

仓库**未自带**构建 / 测试 / 部署的 Actions —— 这部分由 Vercel 的 Git 集成自动完成。

### 12.2 推荐补充（可选）

```
 PR ─► GitHub Actions
        ├─ npm ci
        ├─ npm run lint
        ├─ npm run validate-env (使用 PR Secret)
        └─ npm test (若引入 Vitest/Jest)
       └─► Vercel Preview Deploy ─► Supabase Preview Branch
```

---

## 13. 安全部署清单

- [x] CSP / HSTS / X-Frame / XCTO / Referrer / Permissions-Policy（`middleware.ts`）
- [x] CSRF Token（`/api/csrf-token` + `csrfFetch` + `CSRF_SALT`）
- [x] 限流（`lib/rate-limiter.ts`，匿名 3 视频 / 30 分钟，登录用户更高）
- [x] 输入净化（`dompurify` + `jsdom`）
- [x] Zod 校验（`lib/schemas.ts` / `lib/validation.ts`）
- [x] 审计日志（`lib/audit-logger.ts`）
- [x] Service Role Key 仅服务端使用
- [x] Webhook 路由排除安全中间件 body 改写
- [ ] **生产前必查**：所有 `*_API_KEY` 走 Vercel/容器密钥管理，禁止入库
- [ ] **生产前必查**：`CSRF_SALT` ≥ 32 字节随机
- [ ] **生产前必查**：Stripe live key 与 webhook secret 一致
- [ ] **生产前必查**：Supabase RLS 已启用、anon key 不能直接读敏感表

---

## 14. 上线后运维

| 维护项 | 路径 / 工具 |
| --- | --- |
| 使用量 / 订阅同步 | `npm run` 启动 `scripts/sync-all-subscriptions.ts` / `sync-subscription-from-stripe.ts` |
| 充值积分修复 | `scripts/add-credits.ts` |
| Pro 权限授予 | `scripts/grant-pro-access.ts` |
| 退款 / 测试取消 | `scripts/test-cancellation-webhook.ts`、`scripts/revert-test-cancellation.ts` |
| 邮件群发 | `scripts/send-newsletter.ts` / `scripts/send-test-newsletter.ts` |
| 限流重置 | 直接清理 `rate_limit_logs` |
| Analytics | `@vercel/analytics` + `20251202120000_analytics_dashboard.sql` 视图 |
| 日志 | Vercel Function Logs + Supabase Logs + Stripe Dashboard |

### 14.1 回滚策略

- 应用层：Vercel `Promote previous deployment`（秒级）
- 数据库：迁移以「向前修复（forward-fix）」为主；破坏性变更前手动 `pg_dump`，必要时手写补偿迁移
- Stripe：Webhook 幂等锁保证重复事件安全；如需重放使用 Stripe Dashboard `Resend`

---

## 15. 一句话部署总览

**Vercel 托管 Next.js 15 + Turbopack 应用，由 `middleware.ts` 完成 Supabase 会话刷新与全套安全响应头；Supabase 提供 Postgres + Auth + RLS（迁移在 `supabase/migrations/` 按时间序应用，预览分支由 GitHub Actions 自动清理）；Stripe 通过 `/api/webhooks/stripe`（Node runtime + 原始 body + 幂等锁）接收事件；AI 通过 `lib/ai-providers/` 适配层路由 MiniMax/Grok/Gemini，凭据缺失时自动回退；本地用 `npm run dev` + `validate-env`，生产前用 `npm run build` + `supabase db push` + `stripe:setup-portal` 三件套保证一致性。**
