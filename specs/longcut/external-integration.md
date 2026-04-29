# LongCut 外部系统与 API 集成清单

> 基于 `vendors/longcut` 源码梳理的所有外部依赖、调用协议、鉴权方式与故障策略。

---

## 总览拓扑

```
                       ┌──────────────────────────────────────┐
                       │         LongCut (Next.js 15)         │
                       │  ┌──────────────┐  ┌──────────────┐  │
                       │  │  Browser     │  │  Server      │  │
                       │  │  (RSC + RCC) │  │  (Route Hdl) │  │
                       │  └──────┬───────┘  └──────┬───────┘  │
                       └─────────┼─────────────────┼──────────┘
                                 │                 │
       ┌─────────────────┬───────┼─────────┬───────┼───────────┬────────────────┐
       │                 │       │         │       │           │                │
       ▼                 ▼       ▼         ▼       ▼           ▼                ▼
┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│ YouTube    │  │ AI Providers │  │  Supabase    │  │   Stripe     │  │   Postmark      │
│ (3 渠道)   │  │ MiniMax/Grok │  │ Auth/PG/Edge │  │ Pay/Webhook  │  │ Transactional   │
│ + Supadata │  │ Gemini       │  │              │  │              │  │ Email           │
└────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘
                                                                              ▲
                                                       ┌──────────────────────┤
                                                       │                      │
                                                ┌──────────────┐     ┌────────────────┐
                                                │  Vercel      │     │  Supabase      │
                                                │  Analytics   │     │  pg_net 触发器 │
                                                └──────────────┘     └────────────────┘
```

---

## 一、YouTube 生态（三个独立通道）

LongCut 不依赖单一 YouTube API，而是通过三种互补方式拿到视频数据：

```
┌─ 用户粘贴 URL ─┐
│                │
▼                ▼
┌──────────────────────────── 通道 1 ────────────────────────────┐
│ 视频元数据：YouTube oEmbed                                       │
│ GET https://www.youtube.com/oembed?url=...&format=json          │
│   → 返回 { title, author_name, thumbnail_url }                   │
│   位置：lib/video-info-provider.ts                                │
│   鉴权：无（公开端点）                                            │
│   降级：失败时使用 img.youtube.com/vi/{id}/maxresdefault.jpg     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────── 通道 2 ────────────────────────────┐
│ 转写抓取（首选，免费）：YouTube InnerTube API                    │
│   1. 抓 watch 页 HTML，提取页面内嵌的 INNERTUBE_API_KEY          │
│   2. POST youtubei/v1/player（Android / Web / iOS 三身份轮换）   │
│   3. 解析 captionTracks，下载 timedtext XML                      │
│   位置：lib/youtube-transcript-provider.ts                        │
│   鉴权：使用 YouTube 自身公开 key + 仿造 User-Agent              │
│   策略：FALLBACK_CHAIN = Android → Web → iOS                     │
│   错误码：BOT_DETECTED / IP_BLOCKED / TRANSCRIPTS_DISABLED ...   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────── 通道 3 ────────────────────────────┐
│ 转写抓取（兜底，付费）：Supadata API                            │
│ GET https://api.supadata.ai/v1/transcript?url=...&lang=...      │
│   Header: x-api-key: $SUPADATA_API_KEY                           │
│   位置：app/api/transcript/route.ts (line 113)                   │
│   触发条件：通道 2 失败且 SUPADATA_API_KEY 已配置                │
│   兼容处理：自动检测时间戳是 ms 还是 s，统一归一化              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────── 通道 4 ────────────────────────────┐
│ 前端嵌入播放器：YouTube IFrame API                               │
│ <script src="https://www.youtube.com/iframe_api"></script>       │
│   new YT.Player("youtube-player", { ... })                       │
│   位置：components/youtube-player.tsx                             │
│   作用：完整播放器控件 + 通过 PlaybackCommand 接收 SEEK/PLAY 等  │
│   CSP 已显式放行 youtube.com / s.ytimg.com / *.ytimg.com         │
└──────────────────────────────────────────────────────────────────┘
```

| 项目 | 集成方式 | 鉴权 | 故障策略 |
|---|---|---|---|
| **oEmbed 元数据** | 无密钥 GET | — | 失败回退占位元数据 |
| **InnerTube 转写** | 仿造客户端 POST | 页面公开 key | 三身份轮换；失败转 Supadata |
| **Supadata 转写** | REST GET | `x-api-key` | 二次失败返回 `noCreditsUsed: true` |
| **IFrame Player** | 浏览器脚本注入 | — | 全局 `window.YT` 检测重用实例 |

> 设计要点：免费通道优先，仅在受阻时才消耗付费配额；时间戳格式自动探测；`UNLIMITED_VIDEO_USERS` 白名单可跳过节流。

---

## 二、AI Provider 多供应商适配

```
                ┌──────────── lib/ai-client.ts ────────────┐
                │  generateAIResponse({prompt, schema})      │
                └──────────────────┬───────────────────────┘
                                   │
                ┌──────────────────┴───────────────────┐
                │  lib/ai-providers/registry.ts          │
                │  · 读取 AI_PROVIDER (minimax/grok/gem) │
                │  · 凭据缺失自动 fallback              │
                └──┬───────────────┬───────────────────┬─┘
                   │               │                   │
                   ▼               ▼                   ▼
         ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐
         │  MiniMax       │ │  xAI Grok    │ │  Google Gemini  │
         └────────────────┘ └──────────────┘ └─────────────────┘
```

### 2.1 MiniMax（默认文本 Provider）

```
位置：lib/ai-providers/minimax-adapter.ts
URL ：POST $MINIMAX_API_BASE_URL || https://api.minimax.io/v1/chat/completions
鉴权：Authorization: Bearer $MINIMAX_API_KEY
模型：MiniMax-M2.7 (默认，可被 AI_DEFAULT_MODEL 覆盖)
特性：
  · reasoning_split: true (启用思维链)
  · 客户端剥离 <think>/<thinking> 标签
  · Zod schema → JSON Schema → prompt 内联约束
  · 输出 JSON 用 Zod 二次校验
错误映射：
  · 401/403  → "authentication failed"
  · 429/1002 → "rate limit"
  · 408/timeout → "timeout"
  · 5xx → "service unavailable"
```

### 2.2 xAI Grok（可选 Provider）

```
位置：lib/ai-providers/grok-adapter.ts
URL ：POST $XAI_API_BASE_URL || https://api.x.ai/v1/chat/completions
鉴权：Authorization: Bearer $XAI_API_KEY
模型：grok-4-1-fast-non-reasoning（默认）
特性：
  · 原生 response_format: json_schema 结构化输出
  · sanitizeSchemaForGrok() 移除 minLength/maxItems 等不支持字段
```

### 2.3 Google Gemini（图像 + 可选文本）

```
位置：lib/ai-providers/gemini-adapter.ts （文本，SDK 调用）
SDK ：@google/generative-ai → new GoogleGenerativeAI(apiKey)
鉴权：GEMINI_API_KEY
模型级联（自动回退）：MODEL_CASCADE 数组逐个尝试

位置：app/api/generate-image/route.ts （图像，REST 调用）
URL ：POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
模型：gemini-3-pro-image-preview （可被 GEMINI_IMAGE_MODEL 覆盖）
特性：
  · responseModalities: ['IMAGE']
  · imageConfig: { aspectRatio, imageSize: '1K' }
  · 返回 inlineData (base64) → 拼成 data: URL
```

| Provider | 用途 | 鉴权 Header / SDK | 调用形态 | 关键特性 |
|---|---|---|---|---|
| MiniMax | 默认文本 | `Bearer` | fetch | reasoning_split + Zod 二次校验 |
| Grok | 可选文本 | `Bearer` | fetch | 原生 JSON Schema |
| Gemini (text) | 可选文本 | SDK | `@google/generative-ai` | 级联模型自动回退 |
| Gemini (image) | 图像生成 | URL `?key=` | fetch | 多风格预设 + 长宽比配置 |

---

## 三、Supabase（Auth + Postgres + RLS + Edge）

```
┌──────────────── 三种 Supabase Client 形态 ────────────────┐
│                                                            │
│ 1. Browser Client  (lib/supabase/client.ts)                │
│    @supabase/ssr → createBrowserClient()                   │
│    用于：登录、笔记 CRUD、收藏切换等                       │
│                                                            │
│ 2. Server Client   (lib/supabase/server.ts)                │
│    @supabase/ssr → createServerClient()                    │
│    + Next.js cookies() 同步会话                             │
│    用于：Route Handler 内的鉴权 + RLS 访问                  │
│                                                            │
│ 3. Service Role    (lib/supabase/admin.ts)                 │
│    @supabase/supabase-js → createClient(SERVICE_ROLE_KEY)  │
│    单例，跳过 RLS                                           │
│    用于：Stripe Webhook、Welcome Email、内部系统调用        │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Auth（认证）

```
登录方式：
  ① email + password    supabase.auth.signInWithPassword
  ② Google OAuth        supabase.auth.signInWithOAuth({ provider: 'google' })
                        redirectTo: $NEXT_PUBLIC_APP_URL/auth/callback

会话管理：
  middleware.ts → updateSession(request)
    · 每次请求自动刷新 access token
    · cookie 同步到 SSR 端

OAuth 回调：app/auth/callback/route.ts → 交换 code for session
匿名→登录绑定：sessionStorage.pendingVideoId + /api/link-video
```

### 3.2 Postgres 表

| 表 | 用途 |
|---|---|
| `profiles` | 用户资料、偏好、订阅层级、Stripe customer_id |
| `video_analyses` | 完整分析结果（transcript / topics / summary） |
| `user_videos` | 历史 + 收藏 |
| `user_notes` (`notes`) | 用户笔记，多源 metadata |
| `rate_limits` | 速率限制日志（IP hash 或 user:id） |
| `pending_welcome_emails` | 欢迎邮件待发队列 |
| `audit_logs` | 安全审计事件 |
| `image_generation_*` | 图像生成额度跟踪 |

### 3.3 数据库内置外联（pg_net + pg_cron）

```
┌─ Supabase Postgres ────────────────────────────────────────┐
│  Trigger: 用户注册                                          │
│      ↓                                                      │
│  INSERT INTO pending_welcome_emails (status='pending')      │
│      ↓                                                      │
│  pg_cron 定时任务（每分钟）                                 │
│      ↓                                                      │
│  net.http_post(                                             │
│      url := $APP_URL || '/api/email/send-welcome',          │
│      headers := { X-Internal-API-Key: $INTERNAL_API_KEY },  │
│      timeout_milliseconds := 30000                          │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
位置：supabase/migrations/20260110120000_welcome_email_system.sql
```

> 这是一个**数据库 → 应用**的反向集成：DB 内 cron 通过 `pg_net` 直接打回 Next.js API；应用端用 `X-Internal-API-Key` 校验来源。

---

## 四、Stripe（支付与订阅）

```
┌──────────────── 三类 Stripe 接入 ────────────────────────┐
│                                                            │
│ A. 服务端 Stripe SDK                                       │
│    new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' }) │
│    位置：lib/stripe-client.ts                               │
│                                                            │
│ B. 浏览器 Stripe.js                                         │
│    loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)          │
│    位置：lib/stripe-browser.ts                              │
│    CDN：https://js.stripe.com/...                          │
│                                                            │
│ C. Webhook 反向回调                                         │
│    POST /api/webhooks/stripe                                │
│    验签：stripe.webhooks.constructEvent(body, sig, secret) │
└────────────────────────────────────────────────────────────┘
```

### Stripe API 调用图

```
浏览器 ──┬─▶ /api/stripe/create-checkout-session ──▶ stripe.checkout.sessions.create
         │                                              ↓
         │                                        Stripe Hosted Page
         │                                              ↓ 支付完成
         │                                              ↓
         │   /api/stripe/confirm-checkout ◀── 用户回跳 success_url
         │                                              ↓
         ├─▶ /api/stripe/create-portal-session ──▶ stripe.billingPortal.sessions.create
         │                                              ↓
         │                                        Customer Portal
         │
         └─▶ /api/subscription/status (轮询订阅状态)

Stripe ───▶ POST /api/webhooks/stripe
            事件：customer.subscription.{created,updated,deleted}
                  checkout.session.completed (订阅 + Top-up)
                  invoice.payment_succeeded / failed
            处理：
              · 验签 stripe-signature
              · 防重放：lockStripeEvent() 行级锁
              · mapStripeSubscriptionToProfileUpdate() → profiles 表
              · processTopupCheckout() → topup_credits +20
              · AuditLogger 记录
```

### 价格/产品配置

```
环境变量：
  STRIPE_PRO_PRICE_ID         = price_...   $9.99/月
  STRIPE_PRO_ANNUAL_PRICE_ID  = price_...   $99.99/年
  STRIPE_TOPUP_PRICE_ID       = price_...   $2.99 一次性 +20 视频
  STRIPE_TOPUP_PRICE_ID_CNY   = price_...   ¥20  (可选 WeChat Pay)

辅助脚本：
  scripts/create-new-prices.ts        创建价格
  scripts/setup-stripe-portal.ts      配置自助门户
  scripts/update-product-description  更新商品文案
  scripts/stripe-smoke.mjs            冒烟测试
```

---

## 五、Postmark（事务邮件）

```
位置：app/api/email/send-welcome/route.ts
SDK ：import * as postmark from 'postmark'
鉴权：POSTMARK_SERVER_TOKEN
发件：zara@longcut.ai (出站事务流)

调用流程：
┌────────────────────────────────────────────────────────────┐
│ Supabase pg_cron ──▶ /api/email/send-welcome               │
│    Header: X-Internal-API-Key (内部凭证校验)                │
│    Body  : { emailId, userId, email, fullName }             │
│      ↓                                                      │
│ new postmark.ServerClient(token).sendEmail({                │
│     From: 'zara@longcut.ai',                                │
│     MessageStream: 'outbound',                              │
│     TrackOpens: true,                                       │
│     TrackLinks: HtmlAndText,                                │
│     HtmlBody: getWelcomeHtmlBody(fullName)                  │
│ })                                                          │
│      ↓                                                      │
│ pending_welcome_emails 状态更新为 'sent'                    │
└────────────────────────────────────────────────────────────┘

模板：lib/email/templates/{welcome,monthly-update}.ts
```

| 用途 | 触发方式 | 入口 |
|---|---|---|
| 注册欢迎邮件 | DB 触发器 + pg_cron + pg_net | `/api/email/send-welcome` |
| 月度更新 newsletter | CLI 脚本批量发送 | `scripts/send-newsletter.ts` |
| 测试 newsletter | CLI 单发 | `scripts/send-test-newsletter.ts` |
| 退订 | 用户访问 `/unsubscribe?token=...` | `/api/newsletter/unsubscribe` |

---

## 六、翻译（基于自家 LLM）

```
位置：lib/translation/llm-translate-client.ts
关键发现：package.json 引入了 @google-cloud/translate，
         但代码里实际未使用 → 翻译完全走自有 LLM Provider

调用链：
  POST /api/translate
    body: { texts: string[], targetLanguage: 'zh-CN', context }
        ↓
  getTranslationClient() → LLMTranslateClient
        ↓
  generateAIResponse() → ai-client.ts → 当前激活 Provider (Gemini/Grok/MiniMax)
        ↓
  分隔符协议：<<<TRANSLATION>>>
  批大小：MAX_BATCH_SIZE=35（超出自动分块并发）
  失败重试：partial result recovery（仅重试失败索引）
```

| 项目 | 值 |
|---|---|
| 端点 | `/api/translate` (登录可用) |
| 鉴权 | Supabase 用户态（`auth.getUser`） |
| 速率限制 | `TRANSLATION_RATE_LIMIT_ENABLED` 控制（默认关） |
| 上下文场景 | `transcript` / `chat` / `topic` / `general` |

---

## 七、Vercel 平台依赖

```
@vercel/analytics
  位置：app/layout.tsx → <Analytics />
  作用：自动收集 PV/UV 与 Web Vitals
  鉴权：部署到 Vercel 时自动注入

环境探测：lib/utils.ts
  · process.env.VERCEL_URL → 自动构造 canonical URL
  · NEXT_PUBLIC_APP_URL 兜底
```

---

## 八、所有外部域名一览（CSP 白名单）

`middleware.ts` 已显式放行的域名，可视作"实际正在通信的外部主机"：

```
script-src   : youtube.com / s.ytimg.com / *.googleapis.com / js.stripe.com
img-src      : i.ytimg.com / img.youtube.com / *.ytimg.com / lh3.googleusercontent.com
connect-src  : *.supabase.{co,in,net,com}  +  ws://...
               *.googleapis.com
               www.youtube.com
               api.stripe.com
media-src    : www.youtube.com
frame-src    : youtube.com / www.youtube.com
```

---

## 九、内部安全凭据（非外部，但用于跨系统通信）

| 变量 | 作用 |
|---|---|
| `INTERNAL_API_KEY` | Supabase pg_net → Next.js 调用的共享密钥（`X-Internal-API-Key`） |
| `CSRF_SALT` | CSRF token HMAC 签名盐 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端跳过 RLS 的高权限密钥 |
| `STRIPE_WEBHOOK_SECRET` | Webhook 签名校验 |
| `UNLIMITED_VIDEO_USERS` | 白名单邮箱（CSV） |

---

## 十、外部集成总览矩阵

| # | 系统 | 类别 | 调用方向 | 鉴权 | 关键文件 | 必需性 |
|---|---|---|---|---|---|---|
| 1 | YouTube oEmbed | 元数据 | 出站 | 无 | `lib/video-info-provider.ts` | 必需 |
| 2 | YouTube InnerTube | 转写 | 出站 | 公开 key | `lib/youtube-transcript-provider.ts` | 必需 |
| 3 | YouTube IFrame API | 播放器 | 浏览器加载 | — | `components/youtube-player.tsx` | 必需 |
| 4 | Supadata | 转写兜底 | 出站 | `x-api-key` | `app/api/transcript/route.ts` | 可选 |
| 5 | MiniMax | LLM 文本 | 出站 | `Bearer` | `lib/ai-providers/minimax-adapter.ts` | 默认 |
| 6 | xAI Grok | LLM 文本 | 出站 | `Bearer` | `lib/ai-providers/grok-adapter.ts` | 可选 |
| 7 | Google Gemini (text) | LLM 文本 | SDK | `GEMINI_API_KEY` | `lib/ai-providers/gemini-adapter.ts` | 可选 |
| 8 | Google Gemini (image) | 图像生成 | 出站 REST | URL `?key=` | `app/api/generate-image/route.ts` | 必需（图像功能） |
| 9 | Supabase Auth | 认证 | SDK | anon / service role | `lib/supabase/*` | 必需 |
| 10 | Supabase Postgres | 数据 | SDK | RLS / service role | `lib/supabase/*` | 必需 |
| 11 | Supabase Google OAuth | 第三方登录 | SDK 桥接 | Supabase 配置 | `components/auth-modal.tsx` | 推荐 |
| 12 | Supabase pg_net | 反向回调 | DB → 应用 | `INTERNAL_API_KEY` | `supabase/migrations/...welcome_email_system.sql` | 推荐 |
| 13 | Stripe API (server) | 支付 | SDK | `STRIPE_SECRET_KEY` | `lib/stripe-client.ts` | 推荐 |
| 14 | Stripe.js (browser) | 支付 | CDN 脚本 | `pk_*` 公钥 | `lib/stripe-browser.ts` | 推荐 |
| 15 | Stripe Webhook | 订阅同步 | 入站 | 签名校验 | `app/api/webhooks/stripe/route.ts` | 推荐 |
| 16 | Postmark | 邮件 | SDK | `POSTMARK_SERVER_TOKEN` | `app/api/email/send-welcome/route.ts` | 推荐 |
| 17 | Vercel Analytics | 指标 | 平台注入 | — | `app/layout.tsx` | 自动 |

---

## 十一、关键设计模式

```
┌────────────────────────────────────────────────────────────┐
│  1. 多通道竞争 + 优先级回退                                 │
│     YouTube 转写：免费通道(InnerTube×3) → 付费通道(Supadata)│
│     LLM 文本   ：默认 Provider → 凭据探测自动切换          │
│     Gemini 模型：MODEL_CASCADE 多模型链式回退              │
│                                                            │
│  2. 鉴权三层级                                              │
│     anon (RLS)   → 公开/匿名访问                            │
│     user session → 普通业务                                 │
│     service role → Webhook / 内部调度                       │
│                                                            │
│  3. 反向集成（DB 主动调应用）                               │
│     pg_cron + pg_net + INTERNAL_API_KEY                     │
│     用于异步邮件发送，避免应用层 cron                       │
│                                                            │
│  4. 凭据按需校验（懒加载）                                  │
│     Stripe / MiniMax / Gemini 客户端 lazy 实例化           │
│     首次使用才报错，避免构建期阻塞                          │
└────────────────────────────────────────────────────────────┘
```

---

## 总结

LongCut 共集成 **17 个外部系统/API**，按职能分布：

- **内容获取**：YouTube（4 个独立通道）+ Supadata 兜底
- **AI 能力**：3 家 LLM 厂商（MiniMax / Grok / Gemini）+ Gemini 图像
- **基础设施**：Supabase（Auth/PG/Edge/pg_net）+ Vercel Analytics
- **商业化**：Stripe（SDK + JS + Webhook）+ Postmark 邮件

设计上呈现明显的**"主备回退 + 厂商解耦 + 鉴权分层"**思路：所有付费/外部依赖均带降级策略，密钥按需懒加载，避免单点不可用导致整体阻塞。
