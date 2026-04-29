# LongCut 安全设计

本文档梳理 `vendors/longcut`（一个基于 Next.js 15 + Supabase + Stripe 的 YouTube 视频 AI 解析应用）的安全设计。所有结论均来自源码阅读，文中以 `路径:行号` 标注关键位置。

---

## 1. 总体安全架构

LongCut 采用「纵深防御 + 边界统一拦截」的策略：所有进入业务逻辑的请求，先经过 Next.js 全局 `middleware.ts`（注入 CSP/HSTS 等响应头并刷新 Supabase 会话），再经过各 API 路由通过 `withSecurity()` 高阶函数装配的安全中间件链（方法白名单 → 鉴权 → 限流 → 体积校验 → CSRF → 安全头 → 业务处理器）。数据层依赖 Supabase RLS 与服务端 Postgres 函数（如 `insert_video_analysis_server`、`update_video_analysis_secure`）做最终授权兜底。

```
                ┌──────────────────────── 浏览器 / 客户端 ────────────────────────┐
                │  csrfFetch (lib/csrf-client.ts)  +  Supabase Browser Client    │
                │  (NEXT_PUBLIC_SUPABASE_ANON_KEY 仅可访问匿名/已登录的 RLS 行)  │
                └────────────────────────────────┬───────────────────────────────┘
                                                 │  HTTPS + Cookie (sb-*, csrf-token)
                                                 ▼
   ┌─────────────────────── Next.js Edge Middleware (middleware.ts) ──────────────────────┐
   │ 1) updateSession(): 刷新 Supabase 会话 / 清理失效 sb-* Cookie                        │
   │ 2) 注入 CSP / HSTS(prod) / X-Frame-Options=DENY / Permissions-Policy / Referrer ...  │
   │ 3) matcher 排除 /api/webhooks（避免改写 Webhook 原始请求体）                         │
   └────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            ▼
   ┌──────────────── API Route Handler (app/api/**/route.ts) 通过 withSecurity 装配 ──────┐
   │  ① 方法白名单 ② requireAuth(getUser) ③ 滑动窗口限流 ④ Content-Length 校验            │
   │  ⑤ Double-Submit CSRF ⑥ 业务处理器 (Zod 校验 / DOMPurify / 业务鉴权)                 │
   │  ⑦ 二次注入响应头 + CORS 来源白名单 + 必要时刷新 CSRF Token                          │
   └────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            ▼
   ┌─────────────────────────────── 数据 / 外部服务边界 ──────────────────────────────────┐
   │  Supabase Postgres (RLS + 受控 SQL Function)                                         │
   │  Stripe (Webhook 签名校验 + event_id 去重)                                           │
   │  AI Provider (MiniMax / Grok / Gemini, 仅服务端持有密钥)                             │
   │  audit_logs (敏感动作审计) + rate_limits (限流持久化)                                │
   └──────────────────────────────────────────────────────────────────────────────────────┘
```

关键文件索引：

| 关注点 | 文件 |
|---|---|
| 全局响应头 / 会话刷新 | `middleware.ts`、`lib/supabase/middleware.ts` |
| 安全中间件预设 | `lib/security-middleware.ts` |
| CSRF 服务端 / 客户端 | `lib/csrf-protection.ts`、`lib/csrf-client.ts` |
| 限流 | `lib/rate-limiter.ts` |
| 输入校验 / 净化 | `lib/validation.ts`、`lib/sanitizer.ts` |
| 审计日志 | `lib/audit-logger.ts` |
| Supabase 客户端三态 | `lib/supabase/{client,server,middleware,admin}.ts` |
| Stripe 集成 | `app/api/webhooks/stripe/route.ts`、`lib/stripe-client.ts` |
| RLS / 服务端函数 | `supabase/migrations/*.sql`（尤其 `20251214185226_security_ownership.sql`） |

---

## 2. 认证（Authentication）

### 2.1 三类 Supabase 客户端的职责隔离

```
┌──────────────────────────┬────────────────────────┬──────────────────────────────────────┐
│ 客户端                    │ 持有的密钥              │ 适用场景 / RLS 行为                    │
├──────────────────────────┼────────────────────────┼──────────────────────────────────────┤
│ Browser Client            │ NEXT_PUBLIC_SUPABASE_  │ React 组件内只读 / 用户态写入；      │
│ lib/supabase/client.ts    │ ANON_KEY (公开)        │ 受 RLS 完整约束                      │
├──────────────────────────┼────────────────────────┼──────────────────────────────────────┤
│ SSR Server Client         │ ANON_KEY + Cookie      │ Server Component / Route Handler；   │
│ lib/supabase/server.ts    │ (sb-* httpOnly)        │ 以登录用户身份执行，受 RLS 约束       │
├──────────────────────────┼────────────────────────┼──────────────────────────────────────┤
│ Admin / Service Role      │ SUPABASE_SERVICE_      │ Webhook、限流写入、跨用户写操作；    │
│ lib/supabase/admin.ts     │ ROLE_KEY (仅服务端)    │ 绕过 RLS——必须二次校验所有权         │
└──────────────────────────┴────────────────────────┴──────────────────────────────────────┘
```

设计要点：
- `admin.ts` 通过单例 + `persistSession: false` 避免误把 service role 会话写到 Cookie。
- 服务端 Route 一律走 `createClient()`（SSR Server Client）拿到「以当前登录用户身份」的连接，`auth.getUser()` 是认证的唯一可信源。
- `NEXT_PUBLIC_*` 前缀的键被 Next.js 暴露到客户端 bundle，工程上只能放真正可公开的值（项目 URL、anon key、Stripe publishable key）。

### 2.2 会话生命周期

```
   登录 (邮箱/密码 或 OAuth)               每次请求                       登出
   ─────────────────────────             ─────────────                 ──────────────
   /auth/callback/route.ts        →     middleware.ts                 /api/auth/signout
   exchangeCodeForSession(code)         updateSession(req)             supabase.auth.signOut()
        │                                 │                                  │
        ▼                                 ▼                                  ▼
   写入 sb-access / sb-refresh    刷新 Token；若 refresh_token         显式逐个清理 sb-*
   Cookie (httpOnly, Secure,       失效则清除全部 sb-* Cookie           Cookie，避免回放
   SameSite)                       并降级为匿名访客
```

- `lib/supabase/middleware.ts` 使用 `createServerClient` 在同一响应里读写 Cookie，确保滚动续签时的原子性。
- OAuth 回调显式处理 `error` / `error_code=otp_expired`（`app/auth/callback/route.ts` L14–L25），失败重定向时不向 URL 注入额外用户输入。
- 登出路由同时调用 `signOut()` 与 Cookie 清理，应对 Supabase SDK 偶发的 Cookie 残留。

### 2.3 匿名访客 vs 登录用户

匿名用户也能体验单个视频解析：通过稳定 cookie token + 哈希 IP 识别身份（`lib/guest-usage.ts`、`lib/rate-limiter.ts`）。任何会写入用户数据的 API（`/api/notes`、`/api/link-video`、`/api/toggle-favorite` 等）都强制 `requireAuth: true`。

---

## 3. 授权（Authorization）

LongCut 在三个层次叠加授权检查，避免任何单点失误直接导致越权。

```
            ┌───────────────────────────────────────────────────────┐
            │ L1  Route 级：withSecurity({ requireAuth: true })     │
            │     getUser() 失败 → 401，并写 audit_logs(            │
            │     UNAUTHORIZED_ACCESS)                              │
            └────────────────────────┬──────────────────────────────┘
                                     ▼
            ┌───────────────────────────────────────────────────────┐
            │ L2  业务级：在 Route 内部对比 user.id 与目标资源       │
            │     - /api/notes：user_id == auth.user.id             │
            │     - /api/link-video：通过 youtube_id 反查后绑定     │
            │     - /api/video-analysis：订阅档位 + 配额检查        │
            └────────────────────────┬──────────────────────────────┘
                                     ▼
            ┌───────────────────────────────────────────────────────┐
            │ L3  数据库级：Supabase RLS + 受控 SQL Function         │
            │     - audit_logs：SELECT 仅本人；INSERT 仅 service     │
            │     - rate_limits：用户无直接权限，只能通过函数调用    │
            │     - video_analyses：created_by 字段 +                │
            │       update_video_analysis_secure() 强制校验所有权    │
            └───────────────────────────────────────────────────────┘
```

要点：
- `supabase/migrations/20251214185226_security_ownership.sql` 引入 `created_by` 字段并把写入收敛到两个 PL/pgSQL 函数（`insert_video_analysis_server`、`update_video_analysis_secure`），在 service role 路径上仍然按调用者身份做最终校验，弥补 service key 绕过 RLS 的风险。
- `supabase/migrations/20251101120001_add_audit_and_rate_limit_tables.sql` 中 `audit_logs` / `rate_limits` 的 RLS 策略将匿名/普通用户阻挡在写路径之外。
- Webhook（`app/api/webhooks/stripe/route.ts`）以 service role 写入 `profiles`、`subscriptions`、`topup_credits`，每一步都同步写入 `audit_logs`，方便事后复核。

---

## 4. 接口安全：`withSecurity` 中间件

`lib/security-middleware.ts` 把 6 项检查打包成可复用的高阶函数。各 Route 通过下表的 `SECURITY_PRESETS` 选择策略：

```
   withSecurity(handler, preset)
        │
        ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ ① allowedMethods 白名单                  → 405 Method Not Allowed         │
   │ ② requireAuth → supabase.auth.getUser()  → 401 + audit UNAUTHORIZED       │
   │ ③ RateLimiter.check(url, rateLimit)       → 429 + audit RATE_LIMIT_EXCEEDED│
   │ ④ Content-Length > maxBodySize           → 413 Payload Too Large          │
   │ ⑤ csrfProtection (POST/PUT/PATCH/DELETE) → 403 + audit CSRF FAIL          │
   │ ⑥ handler(req) → 注入安全头 + CORS 白名单 + 必要时刷新 csrf-token         │
   └──────────────────────────────────────────────────────────────────────────┘
```

预设矩阵：

| Preset | requireAuth | CSRF | 限流（默认窗口） | maxBodySize | allowedMethods |
|---|---|---|---|---|---|
| `PUBLIC` | ✗ | ✗ | `API_GENERAL`（60/min） | 1 MB | GET, POST |
| `AUTHENTICATED` | ✓ | ✓ | `AUTH_GENERATION`（20/h） | 5 MB | GET, POST, PUT, DELETE |
| `AUTHENTICATED_READ_ONLY` | ✓ | ✗ | `READ_ONLY` | 1 MB | GET |
| `STRICT` | ✓ | ✓ | 10/min | 512 KB | POST |

异常通道：`/api/webhooks/*` 在 `middleware.ts` 的 matcher 中被排除，避免 Edge 中间件改动 Stripe 原始请求体导致签名校验失败；Webhook 自行实现签名验证与去重。

---

## 5. CSRF 防护

采用 Double-Submit Cookie 模式：

```
   GET /api/csrf-token  (要求 requireAuth)
        │
        ▼  生成或复用 32 字节随机 token (lib/csrf-protection.ts)
   ┌────────────────────────────────────────┐
   │ Set-Cookie: csrf-token=<v>;            │
   │   HttpOnly; Secure(prod);              │
   │   SameSite=Strict; Max-Age=86400       │
   │ Header: X-CSRF-Token: <v>              │
   └──────────────────┬─────────────────────┘
                      ▼
   客户端 csrfFetch (lib/csrf-client.ts)
   - 内存缓存 token
   - 对 POST/PUT/PATCH/DELETE 自动注入 X-CSRF-Token
   - 收到 403 自动重取 token 重试一次

   服务端 validateCSRF(req)
   - 比对 Cookie 中 csrf-token 与 Header X-CSRF-Token
   - 不一致 → 403 + audit_logs(UNAUTHORIZED_ACCESS, reason=CSRF)
```

注意点：
- 仅当 `existingToken` 校验失败时才 `injectCSRFToken`，避免每次请求都旋转 token 触发并发竞争（`lib/security-middleware.ts:140-148`）。
- Webhook 路由不走该中间件（无浏览器 Origin），通过签名而非 CSRF 防伪造。

---

## 6. 限流（Rate Limiting）

```
   identifier 选择
   ─────────────
   登录用户  →  user:<auth.user.id>
   匿名用户  →  anon:<sha256(ip + ua_前缀)>          (IP 不直接落库)

   滑动窗口算法（lib/rate-limiter.ts）
   ┌─────────────────────────────────────────────┐
   │ table rate_limits: (identifier, key,         │
   │                     window_start, count)     │
   │ check():                                     │
   │   1. 删除/忽略窗口外记录                      │
   │   2. 统计当前窗口请求数                       │
   │   3. < limit  → +1 写入，allowed=true         │
   │   4. >= limit → allowed=false, 返回 reset_at  │
   └─────────────────────────────────────────────┘
```

主要档位（节选）：

| Key | 用途 | 阈值 |
|---|---|---|
| `ANON_GENERATION` | 匿名解析新视频 | 1 / 24h |
| `ANON_CHAT` | 匿名 AI 聊天 | 10 / min |
| `AUTH_GENERATION` | 登录用户生成类接口 | 20 / h |
| `VIDEO_GENERATION_FREE` | 免费档完整解析 | 3 / 30d |
| `VIDEO_GENERATION_PRO` | Pro 档完整解析 | 100 / 30d |
| `AUTH_ATTEMPT` | 登录尝试 | 5 / 15min |
| `API_GENERAL` | 兜底 | 60 / min |

`rate_limits` 表通过 migration 中的清理任务删除 31 天前的记录，避免无限增长。所有 429 都会同步写 `audit_logs(RATE_LIMIT_EXCEEDED)`，便于发现刷量。

---

## 7. 输入校验与输出净化

```
   入口（用户/外部）       校验/净化                              落地/渲染
   ───────────────        ──────────                              ─────────
   YouTube URL/ID    ─►  Zod + YOUTUBE_ID_REGEX (/^[\w-]{11}$/) ─► 只读传给 oEmbed/YouTube
   Transcript JSON   ─►  Zod 限制 segment 数 ≤ 50000 / 500k 字符 ─► JSONB 写入数据库
   Note text         ─►  Zod max(5000) + UUID 校验               ─► 保存前 sanitizeForDatabase
   Chat message      ─►  Zod max(10000)，citations 结构校验      ─► 传给 AI Provider
   AI 输出 / HTML    ─►  DOMPurify 白名单 + 协议过滤              ─► 渲染到 React
```

净化策略（`lib/sanitizer.ts`）：
- HTML 仅保留 `b/i/em/strong/a/p/br/ul/ol/li/code/pre`；禁用 `script/style/iframe/object/embed/form/input` 及 `on*`/`javascript:`。
- URL 仅放行 `http`、`https`、`mailto`，拦截 `javascript:`、`data:`、`vbscript:`。
- `formatValidationError` 把 Zod 错误展开为友好的字段级提示，避免堆栈泄露。

---

## 8. 安全响应头

`middleware.ts` 在 Edge 上为所有非排除路径附加：

```
   Content-Security-Policy: default-src 'self';
       script-src 'self' 'unsafe-inline' 'unsafe-eval' youtube/stripe/googleapis ...
       connect-src 'self' *.supabase.{co,in,net,com} (含 wss) api.stripe.com ...
       frame-src https://www.youtube.com https://youtube.com;
       frame-ancestors 'none'; object-src 'none';
       base-uri 'self'; form-action 'self'; upgrade-insecure-requests
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   X-XSS-Protection: 1; mode=block
   Referrer-Policy: strict-origin-when-cross-origin
   Permissions-Policy: camera=(), microphone=(), geolocation=()
   Strict-Transport-Security: max-age=31536000; includeSubDomains   (仅 production)
```

`withSecurity` 在 API 响应上重复设置同一组头，防御「Edge middleware 被 matcher 跳过 / 被反代覆盖」的边界情况。`unsafe-inline`、`unsafe-eval` 仅出于 YouTube IFrame API 和 Stripe.js 的兼容性保留，未来可改造为 nonce-based CSP。

---

## 9. 支付安全（Stripe）

```
   Stripe ──HTTP POST──►  /api/webhooks/stripe  (Edge middleware 已排除该路径)
                              │
                              ▼
   ① stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
        失败 → 400 (不消耗重试预算)
   ② 写入 stripe_events(event_id UNIQUE)
        - 23505（duplicate key）→ 204 直接幂等返回
        - 其它错误 → 释放锁，500 让 Stripe 重投
   ③ 按事件类型分发：
        checkout.session.completed   → 订阅 / 加值
        customer.subscription.*      → 同步 profiles 档位、周期、取消标志
        invoice.payment_failed       → 标记付款失败 + audit
   ④ 所有写入均通过 service-role 客户端 + audit_logs 留痕
```

要点：
- 仅服务端持有 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET`，前端使用 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`。
- `lib/stripe-client.ts` 在启动时校验密钥配置一致性（test/live 模式不混用）。
- 加值（topup）用 payment_intent 维度做幂等，防止同一笔支付重复加点数。

---

## 10. 密钥与环境变量管理

```
   ┌─────────── 服务端独有（绝不出现在 NEXT_PUBLIC_*）──────────┐
   │ SUPABASE_SERVICE_ROLE_KEY     绕过 RLS                      │
   │ STRIPE_SECRET_KEY             调用 Stripe API               │
   │ STRIPE_WEBHOOK_SECRET         校验 Webhook 签名             │
   │ MINIMAX_API_KEY / XAI_API_KEY / GEMINI_API_KEY  AI 提供商   │
   │ CSRF_SALT                     CSRF Token 派生盐            │
   │ STRIPE_PRO_PRICE_ID / STRIPE_TOPUP_PRICE_ID   计费配置     │
   └─────────────────────────────────────────────────────────────┘

   ┌─────────── 公开（NEXT_PUBLIC_ 前缀，会进入 JS Bundle） ─────┐
   │ NEXT_PUBLIC_SUPABASE_URL                                    │
   │ NEXT_PUBLIC_SUPABASE_ANON_KEY    （受 RLS 限定）            │
   │ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY                          │
   │ NEXT_PUBLIC_APP_URL                                         │
   │ NEXT_PUBLIC_AI_PROVIDER / NEXT_PUBLIC_AI_MODEL              │
   │ NEXT_PUBLIC_ENABLE_TRANSLATION_SELECTOR                     │
   └─────────────────────────────────────────────────────────────┘
```

`.env.example` 仅承载占位符；`scripts/validate-env.ts`（package.json 中引用）在启动时校验关键变量是否齐备。

---

## 11. 审计与监控

`lib/audit-logger.ts` 定义统一事件枚举（节选）：

```
   认证类       LOGIN / LOGOUT / SIGNUP / PASSWORD_RESET
   视频类       VIDEO_ANALYSIS_CREATE / UPDATE / VIDEO_FAVORITE_TOGGLE
   AI 类        AI_GENERATION / AI_CHAT
   计费类       SUBSCRIPTION_CREATED / UPDATED / CANCELED
                TOPUP_PURCHASED / PAYMENT_FAILED
   安全类       RATE_LIMIT_EXCEEDED / VALIDATION_FAILED
                UNAUTHORIZED_ACCESS / SUSPICIOUS_ACTIVITY
```

`audit_logs` 表记录 `user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at`；写入前自动：
- 屏蔽密码 / token / secret 字段；
- 长字符串截断到 1000 字符；
- 邮箱部分脱敏，标识符缩写显示。

应用未集成外部 APM/Sentry，错误以 console.error 输出到运行平台日志，业务事件靠 `audit_logs` 留痕。

---

## 12. 数据保护与隔离

- 数据库层面：Supabase Postgres 自带传输/落盘加密；应用未在字段级再加密 transcript / topics 等 JSONB 内容（属于知情权衡——这些内容来自公开 YouTube 字幕）。
- 用户隔离：`user_notes`、`user_videos`、`user_favorites`、`profiles` 通过 `user_id` 外键 + RLS / API 层比对实现；`video_analyses` 全局可读但通过 `created_by` 限制写入。
- Cookie：`sb-*`（Supabase 会话）与 `csrf-token` 均设置 `HttpOnly`、`Secure`（生产）、`SameSite=Strict`。
- 数据保留：`rate_limits` 自动清理 31 天以上记录；`audit_logs` 长期保留供合规审计；`stripe_events` 永久去重。

---

## 13. 已知风险与改进方向

```
   ┌────────────────────────────┬────────────────────────────────────────────────┐
   │ 风险                       │ 缓解 / 待办                                     │
   ├────────────────────────────┼────────────────────────────────────────────────┤
   │ CSP 含 unsafe-inline/eval  │ 受 YouTube/Stripe SDK 限制；可分阶段迁移到      │
   │                            │ nonce/hash 模式                                 │
   │ Service Role Key 滥用风险  │ 已用 created_by + secure SQL Function 收敛；    │
   │                            │ 可进一步把所有 service role 写操作集中到一个    │
   │                            │ "受控仓储"层做白名单                            │
   │ JSONB 未加密                │ 视频字幕属公开数据；个性化字段（notes）需      │
   │                            │ 评估是否引入字段级加密                          │
   │ 缺少外部告警/APM           │ 可接入 Sentry，并基于 audit_logs 做异常检测      │
   │ CSRF token 无服务端登记     │ 当前依赖 32 字节随机性；如需更强，可改为        │
   │                            │ HMAC(session_id, salt) + 服务端校验过期时间      │
   └────────────────────────────┴────────────────────────────────────────────────┘
```

---

## 14. 速查清单

- 新增 API 路由：默认套用 `withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED)`；只读公开接口用 `PUBLIC`，敏感写操作用 `STRICT`。
- 客户端发起写请求：使用 `csrfFetch`（`lib/csrf-client.ts`），不要直接 `fetch`。
- 服务端访问数据库：默认走 `lib/supabase/server.ts`；只有需要绕过 RLS 的后端任务才用 `lib/supabase/admin.ts`，并在调用前完成业务侧所有权校验。
- 所有用户输入：先 Zod 校验（`lib/validation.ts`），再 `sanitizeHtml` / `sanitizeUrl`（`lib/sanitizer.ts`）。
- 任何敏感动作（计费、订阅变更、未授权访问、限流触发）必须调用 `AuditLogger`。
- 密钥分类：`NEXT_PUBLIC_*` 才能出现在客户端代码；其余必须只在 Route Handler / Server Component / Webhook 中读取。
