# LongCut 整体架构设计

LongCut 是一个 **Next.js 15 App Router** 单体 Web 应用：前端（React 19 客户端组件） + 后端（Next.js Route Handlers，运行在 Vercel Serverless / Edge）+ Supabase（Postgres + Auth + RLS）+ 多个 AI 提供商（MiniMax / Grok / Gemini）+ Stripe（订阅与 Top-up）+ Postmark（邮件）+ YouTube（字幕、播放器、元数据）。它没有独立后端服务，所有"后端"都以 `app/api/*/route.ts` 的形式存在，统一通过 `withSecurity` 中间件包裹。

---

## 1. 总体分层

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Browser  (React 19 SPA-ish)                       │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │  app/page.tsx │ app/analyze/[videoId] │ app/v/[slug] │ /my-videos    │ │
│ │  /all-notes  │ /settings │ /pricing │ /unsubscribe │ /privacy /terms │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ Components: youtube-player │ transcript-viewer │ ai-chat │           │ │
│ │ highlights-panel │ summary-viewer │ notes-panel │ image-cheatsheet…  │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ Hooks: useAuth │ useSubscription │ useTranslation │ useTranscriptExp │ │
│ │ useModePreference │ useElapsedTimer │ useInAppBrowser                │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ Client libs: csrf-client │ notes-client │ stripe-actions │           │ │
│ │ translation-batcher │ promise-utils (AbortManager)                   │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                          │ (HTTPS, csrfFetch w/ X-CSRF-Token, sb-* cookies)
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                Next.js Edge / Node Middleware (middleware.ts)            │
│  • Supabase session refresh (lib/supabase/middleware.ts → updateSession) │
│  • CSP / HSTS / X-Frame / Referrer-Policy / Permissions-Policy          │
│  • Excludes /api/webhooks/* (raw body needed for Stripe signature)       │
└──────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│              Next.js Route Handlers  (app/api/*/route.ts)                │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │   withSecurity()  ── method allowlist → auth → rate-limit →          │ │
│ │                      body size → CSRF → security headers             │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │  Domain handlers:                                                    │ │
│ │  • Video ingest: /transcript /video-info /check-video-cache /random… │ │
│ │  • AI gen: /generate-{topics,summary,image} /chat /quick-preview …   │ │
│ │  • Persist: /video-analysis /save-analysis /update-… /link-video …   │ │
│ │  • Notes: /notes /notes/all /notes/enhance                           │ │
│ │  • Translate: /translate                                             │ │
│ │  • Auth: /auth/signout                                               │ │
│ │  • Limits: /check-limit /image-limit /csrf-token                     │ │
│ │  • Billing: /stripe/{create-checkout,create-portal,confirm} /sub/…   │ │
│ │  • Webhooks: /webhooks/stripe (raw body, signature verify)           │ │
│ │  • Email: /email/send-welcome /newsletter/unsubscribe                │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
            │           │            │             │              │
            ▼           ▼            ▼             ▼              ▼
   ┌─────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐
   │  Supabase   │ │ AI Pro-  │ │ YouTube   │ │  Stripe  │ │  Postmark  │
   │ Postgres +  │ │ viders:  │ │ InnerTube │ │ + WebHook│ │  (welcome  │
   │ Auth + RLS  │ │ MiniMax  │ │ + oEmbed  │ │  events  │ │  + monthly │
   │ + RPC       │ │ Grok     │ │ + Player  │ │          │ │  newsletter│
   │             │ │ Gemini   │ │ iframe    │ │          │ │  templates)│
   └─────────────┘ └──────────┘ └───────────┘ └──────────┘ └────────────┘
```

每条用户请求：浏览器 → 全局 `middleware.ts`（注入 CSP + 刷新 Supabase session）→ Route handler 入口（`withSecurity` 五道闸门）→ 业务逻辑层（`lib/*`）→ 外部依赖（Supabase / AI provider / Stripe / YouTube / Postmark）。

---

## 2. 模块分层视图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Presentation                                    │
│ Pages: app/                  Components: components/                    │
└─────────────────────────────────────────────────────────────────────────┘
              ↓ uses               ↓ uses
┌─────────────────────────────────────────────────────────────────────────┐
│  Client libs: csrf-client • notes-client • stripe-actions               │
│               translation-batcher • promise-utils                       │
│  Hooks (lib/hooks): use-mode-preference • use-translation               │
│                     use-subscription • use-transcript-export            │
│                     use-elapsed-timer • use-in-app-browser              │
│  Contexts: auth-context • play-all-context                              │
└─────────────────────────────────────────────────────────────────────────┘
              ↓ HTTP (csrfFetch)
┌─────────────────────────────────────────────────────────────────────────┐
│                      Server (Route Handlers)                            │
│  withSecurity wraps every handler:                                      │
│    • RateLimiter (Supabase-backed, sliding window)                      │
│    • Supabase auth check (cookie-based)                                 │
│    • Body size guard                                                    │
│    • CSRF (token in cookie + X-CSRF-Token header)                       │
│    • Security headers + CSRF rotation                                   │
└─────────────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       Domain / Service Layer                            │
│ AI:       ai-client → ai-providers/registry → adapters (Gemini /        │
│           Grok / MiniMax) ; ai-processing (chunk + map-reduce) ;        │
│           prompts/* ; schemas (Zod) ; json-utils                        │
│ Quote:    quote-matcher (Boyer-Moore + n-gram) ; topic-utils ;          │
│           timestamp-utils ; timestamp-normalization                     │
│ Trans-    youtube-transcript-provider (InnerTube w/ Android/Web/iOS     │
│ cript:    fallback) ; transcript-format-detector ; sentence-merger ;    │
│           sentence-utils ; transcript-language ; transcript-export      │
│ Trans-    translation/llm-translate-client ; language-utils ;           │
│ lation:   translation-batcher (client) + /api/translate (server)        │
│ Notes:    notes-client ; /api/notes ; /api/notes/enhance                │
│ Auth:     contexts/auth-context ; lib/supabase/{client,server,          │
│           middleware,admin}                                             │
│ Security: security-middleware ; rate-limiter ; csrf-protection ;        │
│           audit-logger ; sanitizer ; validation (Zod)                   │
│ Billing:  subscription-manager ; usage-tracker ;                        │
│           image-generation-manager ; stripe-{client,browser,actions,    │
│           topup}                                                        │
│ Email:    email/templates/* ; (Postmark client used inside route)       │
│ Misc:     access-control ; guest-usage ; webview-detector ;             │
│           video-info-provider ; video-save-utils ; mock-data            │
└─────────────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│   Persistence (Supabase Postgres)                                       │
│   Tables: profiles • video_analyses • user_videos • video_generations   │
│           topup_purchases • notes (user_notes) • rate_limits            │
│           audit_logs • image_generations • stripe_events …              │
│   RPCs:   consume_video_credit_atomically • consume_image_credit_…      │
│           insert_video_analysis_server • get_usage_breakdown •          │
│           upsert_video_analysis_with_user_link • increment_topup_…      │
│   RLS:    per-user ownership policies (security_ownership migration)   │
│   Migra-  supabase/migrations/* (16 文件, 初始 schema → 各阶段补丁)     │
│   tions                                                                 │
└─────────────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│   External Services                                                     │
│   • YouTube InnerTube + oEmbed + iframe player                          │
│   • AI providers: MiniMax / Grok / Gemini (HTTPS APIs)                  │
│   • Stripe (Checkout, Portal, Webhooks)                                 │
│   • Postmark (transactional email)                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 关键交互流：用户首次分析一个 YouTube 视频

```
 User                Browser                 Next.js                Supabase / AI / YT
  │  1. paste URL        │                       │                            │
  │ ───────────────────► │                       │                            │
  │                      │ 2. extractVideoId     │                            │
  │                      │    router.push        │                            │
  │                      │    /analyze/[id]      │                            │
  │                      ├─────────►             │                            │
  │                      │ 3. csrfFetch GET      │                            │
  │                      │    /api/check-limit   │                            │
  │                      │ ───────────────────►  │ 4. supabase.auth.getUser   │
  │                      │                       │    + canGenerateVideo /    │
  │                      │                       │    guest cookie            │
  │                      │                       │ ─────────────────────────► │
  │                      │ ◄─────────────────────│ ◄───────────── usage stats │
  │                      │                       │                            │
  │                      │ 5. POST /api/check-   │                            │
  │                      │    video-cache        │                            │
  │                      │ ───────────────────►  │ 6. select video_analyses    │
  │                      │ ◄─ cached? ─ y/n ──── │ ◄──────────────────────── │
  │                      │                       │                            │
  │   [Cached path]      │ 7a. fetch transcript +│                            │
  │                      │     topics + summary  │                            │
  │                      │     from cached row   │                            │
  │                      │                       │                            │
  │   [New analysis]     │ 7b. parallel:         │                            │
  │                      │   GET /api/transcript │ → youtube-transcript-      │
  │                      │   GET /api/video-info │   provider (InnerTube,     │
  │                      │                       │   Android→Web→iOS retry)   │
  │                      │                       │ → YouTube oEmbed           │
  │                      │ 7c. Promise.allSettled│                            │
  │                      │   POST /api/generate- │ → ai-processing.chunk()    │
  │                      │        topics         │   → map-reduce candidates  │
  │                      │                       │   → ai-providers.registry  │
  │                      │                       │     .generateStructured-   │
  │                      │                       │     Content (with fallback)│
  │                      │                       │   → quote-matcher hydrate  │
  │                      │   POST /api/generate- │                            │
  │                      │        summary        │                            │
  │                      │   POST /api/quick-    │                            │
  │                      │        preview        │                            │
  │                      │ ◄─── topics, summary  │                            │
  │                      │                       │                            │
  │                      │ 7d. background:       │                            │
  │                      │   POST /api/save-     │ → consumeVideoCreditAtomic │
  │                      │        analysis  ───► │   (RPC, locks profile)     │
  │                      │                       │ → saveVideoAnalysisWith-   │
  │                      │                       │   Retry (RPC w/ backoff)   │
  │                      │   POST /api/suggested-│                            │
  │                      │        questions      │                            │
  │                      │                       │                            │
  │                      │ 8. window.history     │                            │
  │                      │    replaceState →     │                            │
  │                      │    /v/[slug]          │                            │
  │                      │                       │                            │
  │  9. interact:        │                       │                            │
  │   click topic ─────► │ playbackCommand →     │                            │
  │                      │ youtube-player seek   │                            │
  │   ask question ────► │ POST /api/chat ─────► │ ai-providers (structured  │
  │                      │ ◄─ answer + cites ─── │ JSON, citations match w/   │
  │                      │                       │ quote-matcher)             │
  │   take note ───────► │ POST /api/notes ────► │ supabase notes table       │
  │   change theme ────► │ POST /api/generate-   │                            │
  │                      │   topics{theme,exclu- │                            │
  │                      │   deTopicKeys} ─────► │                            │
  │   export srt ──────► │ /api/translate (loop) │                            │
  │                      │  → transcript-export  │                            │
  │   gen image ───────► │ POST /api/generate-   │ → consumeImageCreditAtomic │
  │                      │        image          │ → Gemini image API         │
```

页面状态机（`app/analyze/[videoId]/page.tsx`）：

```
       ┌─── url param / route param ────┐
       │                                │
       ▼                                ▼
   IDLE ───────────────────────►  ANALYZING_NEW
       │                              │
       │ cached query=true            │ stages: fetching → understanding
       ▼                              │           → generating → processing
   LOADING_CACHED ─────────────►──────┤
                                      ▼
                                  (steady state, all data present)
```

主要状态变量（同一个 page 组件持有）：`pageState`、`loadingStage`、`videoInfo`、`transcript`、`baseTopics`、`themes` / `selectedTheme` / `themeTopicsMap` / `usedTopicKeys`、`topics`（合并视图）、`selectedTopic`、`playbackCommand`、`citationHighlight`、`isPlayingAll` / `playAllIndex`、`notes`、`subscriptionStatus`、`selectedLanguage` / `translationCache` 等。所有 API 请求统一由组件级 `AbortManager` 持有 AbortController，组件卸载或重新进入流程时一并 cleanup。

---

## 4. AI 子系统：抽象 + Map-Reduce 话题生成

```
            Caller (route handler / lib)
                       │
                       ▼
          ┌────────────────────────────┐
          │     lib/ai-client.ts       │
          │  generateAIResponse()      │
          │  generateAIResult()        │
          └────────────────────────────┘
                       │
                       ▼
   ┌─────────────────────────────────────────────────┐
   │      lib/ai-providers/registry.ts               │
   │  resolveProviderKey(env / preferred)            │
   │  getProvider() → adapter (singleton cache)      │
   │  generateStructuredContent({…})                 │
   │  ├── try primaryAdapter.generate()              │
   │  └── on retryable error (429/500/timeout/over-  │
   │      load) → fallback adapter (provider-config  │
   │      .getProviderFallbackOrder)                 │
   └─────────────────────────────────────────────────┘
                       │
        ┌──────────────┼─────────────────┐
        ▼              ▼                 ▼
  gemini-adapter  grok-adapter     minimax-adapter
   (REST + JSON  (REST, structured  (REST, retry
    schema, time- output, retries)   on overload,
    out, retries)                    timeout)
```

每个 adapter 实现统一 `ProviderAdapter`：
```ts
{ name, defaultModel, generate(params) → { content, rawResponse?, usage?, model? } }
```
`provider-config.ts` 集中维护：
- `PROVIDER_ORDER`（grok > gemini > minimax 的优先级）
- `PROVIDER_DEFAULT_MODELS`（每家默认模型）
- `PROVIDER_BEHAVIORS`（如 grok 强制全文喂入 + 客户端强制 smart 模式）
- 环境变量 → key 解析
- 缺 API key 时跳过该 provider

### 话题生成（`lib/ai-processing.ts`）的 Map-Reduce 流程

```
   transcript[]  ──► chunkTranscript() ── overlapping chunks (5 min, 45 s overlap)
                                   │
                                   ▼
       ┌──────────────────────────────────────────────────────┐
       │  for each chunk: AI provider call w/ buildChunkPrompt│ ◄ Smart mode only
       │     output: candidate topics (ParsedTopic + chunk meta)│
       └──────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    dedupeCandidates() (timestamp+text key)
                                   │
                                   ▼
       ┌──────────────────────────────────────────────────────┐
       │  buildReducePrompt(candidates) ── single AI call to  │
       │  pick / reorder up to N final highlights             │
       │  (with theme + excludeTopicKeys for re-generation)   │
       └──────────────────────────────────────────────────────┘
                                   │
                                   ▼
             quote-matcher.findTextInTranscript()
              (Boyer-Moore exact → normalized → fuzzy
               n-gram Jaccard 0.85 threshold)
                                   │
                                   ▼
              hydrated Topic[] with segment + char offsets

   Fast mode skips map step: just one prompt over the whole transcript;
   forceFullTranscriptTopicGeneration provider (grok) overrides this.
```

聊天 (`/api/chat`) 用同一抽象层，prompt 强制 JSON `{answer, timestamps[]}`，再走 quote-matcher 把 timestamps 变成 `Citation[]`。

---

## 5. 安全边界与请求闸门

```
 client ── csrfFetch ──►  global middleware.ts  ──►  withSecurity()  ──► handler
            (X-CSRF-          (session refresh)         (5 gates)
             Token,
             sb-* cookies)

 withSecurity gates                       request lifecycle inside handler
 ─────────────────────                    ──────────────────────────────────
 1. method allowlist                      • createClient() (server, cookie auth)
 2. requireAuth → supabase.getUser()      • Zod validation (lib/validation.ts)
 3. RateLimiter.check()  ──► supabase     • core service call (ai-processing,
    rate_limits table, sliding window       subscription-manager, etc.)
 4. body size (Content-Length)            • DB writes via RPC (atomic credit
 5. CSRF: validateCSRF() (cookie==hdr)      consumption, save with retry)
 6. add security headers + rotate token   • respond, withSecurity injects
                                            CSRF rotation if missing/invalid

 CSP / HSTS / X-Frame-Options come from middleware.ts (global).
 Webhooks (/api/webhooks/*) bypass the matcher → raw body for Stripe sig.
```

CSRF token 由服务端 `injectCSRFToken` 写入 `csrf-token` httpOnly cookie；客户端 `csrfFetch` 在 GET `/api/csrf-token` 拿到 `X-CSRF-Token` header（meta），状态变更请求自动带上；遇 403 + "CSRF" 错误自动 clear+retry 一次。

匿名用户用 IP hash 作为 rate-limit identifier，并通过 `lib/guest-usage.ts` 写一个稳定的 cookie，限制"每浏览器一次免费体验"。

---

## 6. 鉴权 / 会话生命周期

```
              Browser                         Edge                     Supabase
                │                              │                           │
   ┌────────────┴───────────┐                  │                           │
   │ AuthProvider (context) │                  │                           │
   │  supabase.auth.getSes-├──────────────────►│                           │
   │  sion()                │                  │ POST auth/v1/token?…─────►│
   │  onAuthStateChange     │◄─────────────────┤                           │
   │  visibilitychange (>30s│                  │                           │
   │  hidden) → refresh +   │                  │                           │
   │  clearCSRFToken()      │                  │                           │
   └────────────┬───────────┘                  │                           │
                │ navigate ──►                 │                           │
                │           middleware.ts ─►   │ updateSession()           │
                │           (refresh token,    │  → supabase.auth.getUser  │
                │            inject CSP/HSTS)  │  → if token invalid:      │
                │           ◄──────────────────│    delete sb-* cookies    │
                │                              │                           │
   sign in (email / OAuth) ───────────────────►│ /auth/callback writes     │
                │                              │ session cookies           │
                │                              │                           │
   pending video flow:                                                     │
   • before showing AuthModal: sessionStorage['pendingVideoId'] = id       │
   • after sign in: AnalyzePage detects pendingVideoId → POST /api/link-   │
     video (with retry/backoff for FK race on profile creation)            │
   • clears sessionStorage on success                                      │
   • profile + auth.users → user_videos linked
```

`access-control.ts` 定义"无限额度"白名单（环境变量 `UNLIMITED_VIDEO_USERS`，邮箱或 user id）。`webview-detector.ts` 用于在 in-app 浏览器里禁用 Google OAuth 入口。

---

## 7. 订阅、用量与 Stripe 闭环

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │  Generation request lifecycle (subscription-manager)                 │
   │                                                                      │
   │  POST /api/save-analysis  (or /generate-topics for some flows)       │
   │     │                                                                │
   │     ▼                                                                │
   │  canGenerateVideo(userId, youtubeId)                                 │
   │     ├─ getUserSubscriptionStatus → profiles                          │
   │     ├─ getUsageStats → fetchUsageBreakdown (RPC)                     │
   │     ├─ isVideoCached(youtubeId) → instant OK + warning              │
   │     └─ decision: OK / CACHED / LIMIT_REACHED / SUBSCRIPTION_INACTIVE │
   │                                                                      │
   │  if allowed:                                                         │
   │     consumeVideoCreditAtomic →                                       │
   │       supabase.rpc('consume_video_credit_atomically')                │
   │       (locks profile row, inserts video_generations,                 │
   │        decrements topup_credits if pro+base exhausted, dedupes      │
   │        repeated youtube_id within period)                            │
   │  saveVideoAnalysisWithRetry → rpc('insert_video_analysis_server')    │
   │                                                                      │
   │  Image flow uses image-generation-manager with parallel limits.      │
   └──────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────┐
   │  Purchase / Manage (client-driven)                                   │
   │                                                                      │
   │  Pricing UI ── stripe-actions.startCheckout() ──►                    │
   │      POST /api/stripe/create-checkout-session  ──►  Stripe Checkout  │
   │      (sets metadata.userId, priceType='subscription'|'topup')        │
   │                                                                      │
   │  Pro user "Manage billing" ── openBillingPortal() ──►                │
   │      POST /api/stripe/create-portal-session    ──►  Stripe Portal    │
   └──────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────┐
   │  Stripe Webhook (server-side source of truth)                        │
   │                                                                      │
   │  Stripe ─► POST /api/webhooks/stripe (raw body, signature verified)  │
   │     ▼                                                                │
   │  lockStripeEvent (insert into stripe_events for idempotency)         │
   │     ▼                                                                │
   │  dispatchStripeEvent:                                                │
   │   • checkout.session.completed                                       │
   │      mode=subscription → mapStripeSubscriptionToProfileUpdate →     │
   │                          UPDATE profiles                             │
   │      mode=payment      → processTopupCheckout → topup_purchases +   │
   │                          increment_topup_credits RPC                │
   │   • customer.subscription.{created,updated,deleted}                 │
   │      → sync profiles.subscription_* / cancel_at_period_end           │
   │      → on delete: downgrade to free, null out fields                 │
   │   • invoice.payment_succeeded / payment_failed                      │
   │      → update status, audit log, may set past_due flag               │
   │     ▼                                                                │
   │  AuditLogger.log(SUBSCRIPTION_*/TOPUP_PURCHASED/PAYMENT_FAILED)     │
   │     ▼                                                                │
   │  Reflected to UI via /api/subscription/status + useSubscription      │
   └──────────────────────────────────────────────────────────────────────┘
```

---

## 8. 数据流：表与 RPC 之间的交互

```
                           profiles  (1:1 auth.users)
                              │
                              ├── subscription_tier / status / period
                              ├── stripe_customer_id / subscription_id
                              ├── topup_credits
                              ├── topic_generation_mode (smart/fast pref)
                              └── newsletter_subscribed
                              ▲
                              │ updated by Stripe webhook
                              │ read by subscription-manager
                              │
   user_videos ◄──── video_analyses (canonical row per youtube_id)
       │              ▲      ▲     ▲
       │ many:many    │      │     │
       │              │      │     │
   user_id            │      │  notes (user_notes)
                      │      │      • per-user-per-video metadata
                      │      │      • source: chat|takeaways|transcript|custom
                      │      │
                video_generations (audit per generation)
                      │      │   • counted_toward_limit
                      │      │   • subscription_tier snapshot
                      │      │   • used by get_usage_breakdown RPC
                      │      │
                      │   image_generations (parallel for /api/generate-image)
                      │
                topup_purchases (Stripe payment_intent dedup)
                      │
                rate_limits (ratelimit:<key>:<identifier>, sliding window)
                audit_logs (security & business events from audit-logger)
                stripe_events (webhook idempotency lock)

   RPCs:
   • consume_video_credit_atomically  → check + insert + decrement, locks row
   • consume_image_credit_atomically  → same shape, image_generations 表
   • get_usage_breakdown / get_image_usage_breakdown → period rollup
   • increment_topup_credits          → atomic + with manual fallback
   • insert_video_analysis_server     → upsert + user_videos link in one tx
   • upsert_video_analysis_with_user_link  (called by /api/save-analysis)
   • consume_topup_credit             → decrement when base exhausted
```

`security_ownership` 迁移开启 RLS：每张表按 `user_id = auth.uid()` 限制；webhook 与服务端任务用 `createServiceRoleClient` 绕过 RLS。

---

## 9. 字幕 / 引用对齐（精度的关键）

```
   /api/transcript ── youtube-transcript-provider ──►
                       try Android InnerTube
                       │  fail (BOT/IP)
                       ▼
                       try Web                      → caption XML download
                       │  fail
                       ▼
                       try iOS                      → parse <text> nodes
                       │
                       ▼
                       TranscriptFetchResult{ segments, language,
                                              availableLanguages }
                            │
                            ▼
   transcript-format-detector  (punctuation ratio + avg length)
                            │
                            │ if 'old' (fragmented):
                            ▼
   transcript-sentence-merger (max 24 s / 80 words / 20 segs guard)
                            │
                            ▼
   normalized TranscriptSegment[]
                            │
                            ├──► used in AI prompts (formatTranscriptWith-
                            │    Timestamps inside ai-processing)
                            ├──► sent to client (transcript-viewer)
                            └──► fed into quote-matcher buildIndex

   AI returns quote text + [MM:SS-MM:SS]  →  quote-matcher.findTextIn-
   Transcript:
     1) Boyer-Moore exact substring match on normalized full text
     2) on miss: normalizeForMatching() + retry
     3) on miss: fuzzy 3-gram Jaccard similarity ≥ 0.85
   → returns startSegmentIdx/endSegmentIdx + char offsets
   → Topic.segments[] populated; transcript-viewer highlights +
     youtube-player can seek precisely + auto-pause at end
```

---

## 10. 翻译子系统

```
   client UI (transcript-viewer / chat / topic / general)
        │
        ▼
   useTranslation hook ── TranslationBatcher (queue, ≤20 ms debounce,
        │                  ≤1000 items per batch, retry, error toast dedup)
        ▼
   csrfFetch POST /api/translate (auth required)
        │
        ▼
   getTranslationClient → LLMTranslateClient (uses generateAIResponse)
        │
        ▼
   prompt: lines joined with <<<TRANSLATION>>> delimiter, includes scenario
   context (videoTitle, topicKeywords, …) for tone consistency
        │
        ▼
   response parsed line by line; partial failures retry indices
        │
        ▼
   client cache (Map<cacheKey, translation>) → re-render with
                                                translatedText fields
   transcript-export uses the same cache + bulk handler when exporting
   in 'translated' / 'bilingual' modes.
```

---

## 11. 笔记系统

```
   触发点                                       存储 / 同步
   ─────                                        ───────────
   • selection-actions（划词→Take note）         POST /api/notes
   • transcript-viewer（quote → note）           (CSRF, auth required)
   • ai-chat（Save assistant message）  ────►   notes (Supabase)
   • notes-panel（custom）                       fields: source, source_id,
   • takeaways prompt response ─► save           text, metadata{transcript,
                                                  chat, selectedText, …}

   Read flow:
   • /api/notes?youtubeId=…  → per-video list
   • /api/notes/all          → cross-video for /all-notes page

   Optional polish:
   • /api/notes/enhance      → AI-powered cleanup (filler-word stripping,
                                可被 selection-actions 触发)
```

---

## 12. 邮件 & 通讯

```
   register / sign in
        │
        ▼
   AuthProvider sees onAuthStateChange('SIGNED_IN')
        │
        ▼ (一次性)
   POST /api/email/send-welcome
        │
        ▼
   Postmark API ◄── email/templates/welcome.ts (HTML)

   monthly newsletter:
        scripts/send-newsletter.ts (cron / 手动) →
        query profiles.newsletter_subscribed = true
        →  Postmark batch send (templates/monthly-update.ts)

   unsubscribe:
        link → /unsubscribe page → POST /api/newsletter/unsubscribe
        → flip profiles.newsletter_subscribed = false
```

---

## 13. 部署拓扑

```
   Vercel project (Next.js 15 + Turbopack)
   ├── Edge runtime   : middleware.ts (CSP/HSTS, Supabase cookie refresh)
   ├── Serverless Node: 所有 /api/* 路由（webhooks/stripe 强制 nodejs runtime）
   └── Static + ISR   : 落地页、价格页、隐私 / 条款、sitemap、robots

   Supabase project
   ├── Auth (email + OAuth 提供商)
   ├── Postgres (上述表 + RPC + RLS policies)
   └── 用作 KV：rate_limits、stripe_events、audit_logs

   外部
   ├── Stripe (Checkout, Portal, Webhooks → Vercel)
   ├── AI APIs: MiniMax / xAI Grok / Google Gemini
   ├── YouTube (无 API key 抓字幕；oEmbed 拿元数据；iframe 播放)
   └── Postmark (transactional email)

   CI / Ops scripts (scripts/*.ts) 本地 / CI 用 tsx 跑：环境校验、Stripe 价格
   配置、订阅/信用同步、用户授权、newsletter 发送等。
```

---

## 14. 模块依赖关系（高维度）

```
       ┌──────────────────────────────────────────────────────────┐
       │                       Pages (app/*)                      │
       └──────────────┬─────────────────────────────┬─────────────┘
                      │                             │
                      ▼                             ▼
       ┌──────────────────────────┐    ┌──────────────────────────┐
       │ Components + Contexts    │    │ Client libs + Hooks      │
       └──────────────┬───────────┘    └────────────┬─────────────┘
                      │                             │
                      └────────────┬────────────────┘
                                   ▼
       ┌──────────────────────────────────────────────────────────┐
       │            csrfFetch  →  app/api/*/route.ts              │
       └──────────────┬───────────────────────────┬───────────────┘
                      │                           │
                      ▼                           ▼
       ┌──────────────────────────┐  ┌──────────────────────────────┐
       │ withSecurity, validation │  │ Domain libs                  │
       │ csrf-protection,         │  │  ai-client → ai-providers/*  │
       │ rate-limiter,            │  │  ai-processing               │
       │ audit-logger, sanitizer  │  │  quote-matcher, topic-utils  │
       │ access-control,          │  │  youtube-transcript-provider │
       │ guest-usage              │  │  subscription-manager,       │
       └──────────────┬───────────┘  │  usage-tracker, image-gen-   │
                      │              │  manager, stripe-*           │
                      │              │  translation/*               │
                      │              │  notes-client, video-save-…  │
                      │              └──────────────┬───────────────┘
                      └────────────────┬────────────┘
                                       ▼
       ┌──────────────────────────────────────────────────────────┐
       │ lib/supabase/{client,server,middleware,admin} → Supabase │
       │ external SDKs: stripe, @google/generative-ai, postmark   │
       └──────────────────────────────────────────────────────────┘
```

---

## 15. 设计要点（横切关注点）

- **Provider 可插拔 + 自动 fallback**：路由层只调 `generateAIResponse / generateAIResult`，不感知 provider；registry 在 retryable 错误（429 / 5xx / timeout / overload）时自动切换到下一个有 API key 的 provider；`provider-config.PROVIDER_BEHAVIORS` 决定是否强制全文喂入或 smart 模式。
- **结构化输出**：所有需要 JSON 的 AI 路径都附 Zod schema（`lib/schemas.ts`），并配 `json-utils.repairJson` 容错；聊天回答里嵌的 `[MM:SS]` 时间戳走 `quote-matcher` 二次定位。
- **并行优先**：分析页面用 `Promise.allSettled` 并行 transcript / video-info / topics / summary / preview；非关键写库走 `backgroundOperation` + AbortManager 防止内存泄漏。
- **原子化额度消耗**：所有"消耗 1 次生成"用 Postgres RPC 在事务里 lock + insert + decrement，避免并发条件竞态；webhook 处理用独立 `stripe_events` 表加幂等锁。
- **缓存优先**：已分析过的 youtube_id 直接复用 `video_analyses` 行，免 AI 重生成；缓存命中时若缺 summary，仍后台异步补齐。
- **匿名 → 登录的视频迁移**：`pendingVideoId` 存 sessionStorage，登录后 `link-video` 带指数退避（应对 profile FK 创建竞态）。
- **多层安全**：全局 middleware（CSP/HSTS/Auth refresh） + 路由级 `withSecurity`（auth/限流/Body/CSRF/headers） + DB 级 RLS + 审计日志 + Zod 输入校验 + DOMPurify HTML 消毒 + IP hash 化的匿名标识。
- **内容流水线解耦**：字幕格式探测 → 句子合并 → AI 分块 → 引用匹配 → 客户端高亮，每一步都可独立替换；客户端翻译批处理器在不改服务端协议的前提下叠加多语言能力。
- **Stripe 事件作为单一可信源**：客户端从不直接修改订阅状态，全部由 webhook 写入 `profiles`；UI 通过 `/api/subscription/status` 读取。
