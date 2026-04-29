# LongCut 技术栈梳理

> 基于 `vendors/longcut` 源码梳理，覆盖框架、UI、AI、数据、支付、安全、构建工具等全部技术选型。

---

## 1. 总体定位

LongCut 是一款基于 Next.js 15 App Router 的全栈 Web 应用，核心能力是把长 YouTube 视频通过 AI 转换成「主题驱动的高亮片段（Highlight Reels）」与多模态学习体验（摘要 / 聊天 / 笔记 / 转写 / 引用）。

- 部署目标：Vercel（启用 Turbopack）
- 渲染范式：React 19 + Server Components + Route Handlers
- 包管理：同时存在 `package-lock.json` 与 `pnpm-lock.yaml`，pnpm 为主；脚本统一通过 `npm run` 定义。

---

## 2. 语言 / 编译 / 运行时

| 类型 | 选型 | 说明 |
| --- | --- | --- |
| 语言 | TypeScript ^5（`strict: true`） | `tsconfig.json` target=ES2017，moduleResolution=bundler，路径别名 `@/* -> ./*` |
| 运行时 | Node.js 20 类型声明（`@types/node@^20`） | Next.js 15 + Edge/Node 路由混用 |
| 脚本运行器 | `tsx ^4.19.0` | 用于环境校验、Stripe 维护脚本等 |
| 模块系统 | ESM（`*.mjs` / `module: "esnext"`） | PostCSS、ESLint 配置文件均使用 `.mjs` |

---

## 3. 前端框架与 UI

### 3.1 核心框架
- **Next.js `15.5.7`** —— App Router、Route Handlers、`middleware.ts`、`sitemap.ts`、`robots.ts`
- **React `19.1.2`** + **React DOM `19.1.2`**
- **Turbopack**（`next dev --turbopack` / `next build --turbopack`），并配置 `*.svg` 通过 `@svgr/webpack` 处理

### 3.2 样式系统
- **Tailwind CSS v4**（`tailwindcss@^4`、`@tailwindcss/postcss@^4`）
- **PostCSS**（`postcss.config.mjs`，仅启用 `@tailwindcss/postcss` 插件）
- **tw-animate-css `^1.3.7`**：Tailwind 动画扩展
- 原子组合工具：`clsx`、`tailwind-merge`、`class-variance-authority`

### 3.3 组件库
- **shadcn/ui**（`components.json`：style=`new-york`，base=`neutral`，icon=`lucide`，启用 RSC、CSS Variables）
- **Radix UI Primitives**（按需引入）：
  `react-avatar`、`react-dialog`、`react-dropdown-menu`、`react-label`、`react-progress`、`react-radio-group`、`react-scroll-area`、`react-select`、`react-separator`、`react-slider`、`react-slot`、`react-switch`、`react-tabs`、`react-tooltip`
- **Lucide React `^0.542.0`**：图标库
- **Sonner `^2.0.7`**：Toast 通知
- **react-markdown `^10.1.0` + remark-gfm `^4.0.1`**：Markdown 渲染（用于摘要、聊天回复）

### 3.4 应用状态与上下文
- React Hooks 为主，配合自定义 Context：
  - `contexts/auth-context.tsx`、`contexts/play-all-context.tsx`
  - `components/loading-context.tsx`
- 自定义 Hooks（`lib/hooks/`）：`use-elapsed-timer`、`use-in-app-browser`、`use-mode-preference`、`use-subscription`、`use-transcript-export`、`use-translation`

---

## 4. 后端 / API 层

- **Next.js Route Handlers**（`app/api/**/route.ts`）承载所有后端逻辑，无独立服务端框架。
- **`middleware.ts`**：注入 CSP / HSTS / X-Frame-Options 等安全响应头，并通过 `lib/supabase/middleware.ts` 同步 Supabase 会话。
- **校验**：`zod ^4.1.9`（`lib/schemas.ts` / `lib/validation.ts`）
- **HTML 净化**：`dompurify ^3.2.7` + `jsdom ^27.0.0`（服务端 DOM 环境）
- **CSRF 防护**：自研 `lib/csrf-protection.ts` + 客户端 `csrfFetch`（`lib/csrf-client.ts`）
- **安全中间件**：`lib/security-middleware.ts` 提供 `PUBLIC` / `AUTHENTICATED` / `STRICT` 预设
- **审计日志**：`lib/audit-logger.ts`
- **限流**：`lib/rate-limiter.ts`（匿名 vs 登录用户分别计数；落库到 `rate_limit_logs`）
- **Promise / 取消管理**：`lib/promise-utils.ts`（`AbortManager`、`backgroundOperation`、`safePromise`）

---

## 5. AI / 内容生成

### 5.1 文本生成 Provider 抽象
- 统一适配层 `lib/ai-providers/`：
  - `registry.ts` + `provider-config.ts`：根据 `AI_PROVIDER` / `NEXT_PUBLIC_AI_PROVIDER` + 凭据自动路由与回退
  - 适配器：`minimax-adapter.ts`、`grok-adapter.ts`、`gemini-adapter.ts`
  - 共享接口 `types.ts`、客户端配置 `client-config.ts`
- 入口：`lib/ai-client.ts`、`lib/ai-processing.ts`
- 默认模型：`MiniMax-M2.7`（可被 `AI_DEFAULT_MODEL` 覆盖）

### 5.2 SDK / 模型服务
| 用途 | 依赖 | 备注 |
| --- | --- | --- |
| Gemini 文本/图像 | `@google/generative-ai ^0.24.1` | 图像生成路由 `app/api/generate-image` 仍依赖 `GEMINI_API_KEY` |
| Google 翻译 | `@google-cloud/translate ^9.2.1` | 配合 `lib/translation/` 与 `translation-batcher.ts` |
| MiniMax / Grok (xAI) | 通过 REST 直连（自研 adapter） | 由对应 `*_API_KEY` 控制 |

### 5.3 转写与高亮匹配（自研算法）
- 字幕抓取：`lib/youtube-transcript-provider.ts`（解析 YouTube 公开字幕轨）
- 引用回溯：`lib/quote-matcher.ts` —— Boyer-Moore 精确匹配 + 3-gram Jaccard 模糊匹配 + 段落字符偏移映射
- 时间戳工具：`lib/timestamp-normalization.ts`、`lib/timestamp-utils.ts`
- 句子合并 / 检测：`lib/sentence-utils.ts`、`lib/transcript-sentence-merger.ts`、`lib/transcript-format-detector.ts`、`lib/transcript-language.ts`
- Prompt 模板：`lib/prompts/`

### 5.4 生成模式
- `smart`（候选池 + 主题聚类）与 `fast`（直接生成）
- 主题选择缓存（`themeTopicsMap`）以避免重复生成

---

## 6. 数据存储 / 认证

### 6.1 Supabase（PostgreSQL + Auth + Storage）
- SDK：
  - `@supabase/supabase-js ^2.57.4`
  - `@supabase/ssr ^0.7.0`（Cookie 会话）
  - `@supabase/postgrest-js ^2.75.0`
- 客户端拆分（`lib/supabase/`）：
  - `client.ts`（浏览器）/ `server.ts`（Server Component）/ `admin.ts`（Service Role）/ `middleware.ts`（会话刷新）/ `types.ts`
- 主要数据表（见 `supabase/migrations/`）：
  - `video_analyses`、`user_favorites`、`rate_limit_logs`、`notes`
  - 阶段性迁移：Stripe schema、审计 / 限流表、原子积分扣减、语言列、Newsletter 订阅、安全所有权、欢迎邮件系统、视频保存事务修复等
- 认证：邮箱密码 + OAuth（由 Supabase Auth 承载），并通过 `link-video` API 将匿名分析归属到登录账号

### 6.2 缓存与持久化策略
- `/api/check-video-cache` 命中即直出，缺失字段在后台异步补齐
- `backgroundOperation` 写库不阻塞 UI

---

## 7. 计费 / 订阅（Stripe）

- 服务端 SDK：`stripe ^19.2.0`
- 浏览器端：`@stripe/stripe-js ^8.2.0`
- 自研封装：`lib/stripe-actions.ts`、`lib/stripe-browser.ts`、`lib/stripe-client.ts`、`lib/stripe-topup.ts`、`lib/subscription-manager.ts`、`lib/usage-tracker.ts`
- 运维脚本（`scripts/`）：`stripe-smoke.mjs`、`setup-stripe-portal.ts`、`create-new-prices.ts`、`sync-subscription-from-stripe.ts`、`sync-all-subscriptions.ts`、`grant-pro-access.ts`、`add-credits.ts`、`update-product-description.ts`、`test-cancellation-webhook.ts`、`revert-test-cancellation.ts`
- 关键环境变量：`STRIPE_SECRET_KEY`、`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRO_PRICE_ID`、`STRIPE_TOPUP_PRICE_ID`
- Webhook 路由由中间件 `matcher` 排除（避免修改 body）

---

## 8. 邮件 / 通讯

- **Postmark `^4.0.5`**：事务邮件发送
- 模板目录：`lib/email/templates/`
- 相关脚本：`scripts/send-newsletter.ts`、`scripts/send-test-newsletter.ts`
- 数据库迁移：`20260110120000_welcome_email_system.sql`、`20251211185543_add_newsletter_subscription.sql`

---

## 9. 安全

- CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy 全在 `middleware.ts` 注入
- CSRF 令牌：`/api/csrf-token` + `csrfFetch` + `lib/csrf-protection.ts`（盐值 `CSRF_SALT`）
- 输入净化：`lib/sanitizer.ts`（DOMPurify + JSDOM）
- 访问控制：`lib/access-control.ts`、`lib/security-middleware.ts`
- 审计：`lib/audit-logger.ts`（落库 audit 表）
- 限流：匿名 3 视频 / 30 分钟，登录用户更高额度

---

## 10. 可观测 / 分析

- **Vercel Analytics**：`@vercel/analytics ^1.5.0`
- 自研使用量追踪：`lib/usage-tracker.ts`、`lib/guest-usage.ts`
- 数据库视图：`20251202120000_analytics_dashboard.sql`

---

## 11. 工程化与质量

| 类别 | 工具 |
| --- | --- |
| Lint | ESLint `^9.37.0` + `eslint-config-next ^15.5.6`（继承 `next/core-web-vitals`、`next/typescript`，关闭 `no-explicit-any`） |
| 类型 | TypeScript strict |
| 测试 | `lib/__tests__/`、`components/__tests__/`（仓库未声明 runner 依赖；用例文件以 `.test.ts(x)` 命名，按约定可由 Vitest/Jest 等执行） |
| 环境校验 | `scripts/validate-env.ts`（`npm run validate-env`） |
| 配置 | `dotenv ^17.2.3` |
| CI | `.github/`（仓库自带 GitHub Actions 目录） |

---

## 12. 关键运行时依赖速查（`package.json`）

```text
next 15.5.7 · react 19.1.2 · react-dom 19.1.2 · typescript ^5
tailwindcss ^4 · @tailwindcss/postcss ^4 · tw-animate-css ^1.3.7
shadcn/ui (new-york) · 14× @radix-ui/react-* · lucide-react ^0.542.0
sonner ^2.0.7 · react-markdown ^10.1.0 · remark-gfm ^4.0.1
class-variance-authority ^0.7.1 · clsx ^2.1.1 · tailwind-merge ^3.3.1
zod ^4.1.9 · dompurify ^3.2.7 · jsdom ^27.0.0
@supabase/supabase-js ^2.57.4 · @supabase/ssr ^0.7.0 · @supabase/postgrest-js ^2.75.0
stripe ^19.2.0 · @stripe/stripe-js ^8.2.0
@google/generative-ai ^0.24.1 · @google-cloud/translate ^9.2.1
postmark ^4.0.5 · @vercel/analytics ^1.5.0 · dotenv ^17.2.3
```

DevDependencies：`eslint ^9.37.0`、`eslint-config-next ^15.5.6`、`@eslint/eslintrc ^3.3.3`、`tsx ^4.19.0`、`@types/node@^20`、`@types/react@^19`、`@types/react-dom@^19`、`@types/dompurify`、`@types/jsdom`。

---

## 13. 环境变量总览（来自 `.env.example`）

- AI：`AI_PROVIDER`、`NEXT_PUBLIC_AI_PROVIDER`、`AI_DEFAULT_MODEL`、`NEXT_PUBLIC_AI_MODEL`、`MINIMAX_API_KEY`、`MINIMAX_API_BASE_URL`、`XAI_API_KEY`、`GEMINI_API_KEY`
- Supabase：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
- 应用：`NEXT_PUBLIC_APP_URL`、`CSRF_SALT`
- 可选特性：`NEXT_PUBLIC_ENABLE_TRANSLATION_SELECTOR`、`YOUTUBE_API_KEY`、`UNLIMITED_VIDEO_USERS`
- Stripe：`STRIPE_SECRET_KEY`、`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRO_PRICE_ID`、`STRIPE_TOPUP_PRICE_ID`

---

## 14. 一句话总结

**Next.js 15 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 + shadcn/Radix UI** 作为前端骨架；**Supabase（Postgres + Auth + SSR Cookie）** 作为后端数据与认证；**多 Provider AI 适配层（MiniMax / Grok / Gemini） + Google 翻译** 提供内容生成与多语言；**Stripe + Postmark** 处理订阅与通讯；通过自研的 CSRF / 限流 / 审计 / Sanitizer / AbortManager 等中间层补齐安全与异步治理；最终在 **Vercel** 上部署运行。
