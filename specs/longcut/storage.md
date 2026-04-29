# LongCut 存储设计

> 基于 `vendors/longcut/supabase/migrations/**`、`lib/supabase/**`、`lib/types.ts`、`lib/usage-tracker.ts`、`lib/rate-limiter.ts`、`lib/guest-usage.ts`、`lib/video-save-utils.ts`、`app/api/**` 等代码梳理。

LongCut 的存储分为 **服务端持久化（Supabase Postgres）** 与 **客户端轻状态（Cookie / localStorage / sessionStorage）** 两层；不使用任何对象存储桶（视频与图像均直接走 YouTube / Gemini，不在自家落地）。

---

## 0. 全局视图

```
                          ┌────────────────────────────────────────────────┐
                          │                  Browser                        │
                          │  ┌──────────────┐ ┌─────────────────────────┐  │
                          │  │ localStorage │ │ sessionStorage          │  │
                          │  │  tldw-mode-  │ │  pendingVideoId         │  │
                          │  │  preference  │ │  limitRedirectMessage   │  │
                          │  └──────────────┘ └─────────────────────────┘  │
                          │  Cookies (httpOnly):                            │
                          │    tldw_guest_token  (5y)                       │
                          │    tldw_guest_analysis_used  (5y)               │
                          │    sb-* (Supabase auth, via @supabase/ssr)      │
                          └────────────────────────────────────────────────┘
                                            │  HTTPS / CSRF
                                            ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │                Next.js 15 Route Handlers + middleware.ts              │
   │   ┌────────────────────┐  ┌────────────────────┐  ┌────────────────┐ │
   │   │ supabase/server.ts │  │ supabase/admin.ts  │  │ rate-limiter.ts│ │
   │   │  (anon + cookie)   │  │  (service role)    │  │ usage-tracker  │ │
   │   └────────────────────┘  └────────────────────┘  └────────────────┘ │
   └───────────────────────────────────────────────────────────────────────┘
                                            │ PostgREST / RPC
                                            ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                         Supabase Postgres                               │
 │                                                                         │
 │  Extensions:  uuid-ossp · pgcrypto · pg_net · pg_cron · vault           │
 │                                                                         │
 │  ┌─────────────┐  ┌────────────────┐  ┌────────────────┐               │
 │  │  auth.*     │──│  profiles      │──│  user_videos   │──┐            │
 │  │  (users)    │  │  (1:1 w/ user) │  │  (M:N pivot)   │  │            │
 │  └─────────────┘  └────────────────┘  └────────────────┘  │            │
 │         │              │       │              │           │            │
 │         │              │       │              ▼           ▼            │
 │         │              │       │      ┌───────────────────────────┐    │
 │         │              │       │      │  video_analyses           │    │
 │         │              │       │      │  (jsonb cache: transcript │    │
 │         │              │       │      │   topics, summary, Q&A …) │    │
 │         │              │       │      └───────────────────────────┘    │
 │         │              │       │              ▲   ▲                    │
 │         │              │       │              │   │                    │
 │         │              │       └──────────────┘   │                    │
 │         │              ▼                          │                    │
 │         │      ┌────────────────┐  ┌──────────────┴──────┐             │
 │         │      │ video_         │  │ image_generations    │             │
 │         │      │ generations    │  │ (Gemini quota)       │             │
 │         │      │ (text quota)   │  └──────────────────────┘             │
 │         │      └────────────────┘                                       │
 │         │              │                                                │
 │         │              ▼                                                │
 │         │      ┌────────────────┐  ┌────────────────┐                  │
 │         │      │ topup_purchases│  │ stripe_events  │ (idempotency)    │
 │         │      └────────────────┘  └────────────────┘                  │
 │         │                                                              │
 │         ├──► user_notes  (4 source types, jsonb metadata)              │
 │         ├──► audit_logs  (security events)                             │
 │         ├──► rate_limits (sliding window: API + guest)                 │
 │         └──► pending_welcome_emails (pg_cron + pg_net + Vault)         │
 │                                                                         │
 │  Materialized Views (refresh_analytics_views()):                        │
 │     user_activity_summary · user_growth_metrics · revenue_metrics       │
 │     video_usage_metrics   · feature_adoption_metrics                    │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. PostgreSQL 扩展

| 扩展 | 用途 |
| --- | --- |
| `uuid-ossp` | `extensions.uuid_generate_v4()` 生成主键 |
| `pgcrypto` | `gen_random_uuid()` |
| `pg_net` | `net.http_post()` 异步回调应用 `/api/email/send-welcome` |
| `pg_cron` | 调度欢迎邮件队列处理（每分钟 + 周日清理） |
| `vault` | 安全保存 `app_url`、`internal_api_key` 给 SQL 函数读取 |

---

## 2. 业务表清单

```
┌─────────────────────────────┬─────────────────────────┬──────────────────────────────┐
│ 表                           │ 主键 / 唯一键           │ 关键字段（节选）              │
├─────────────────────────────┼─────────────────────────┼──────────────────────────────┤
│ profiles                    │ id = auth.users.id      │ email, subscription_tier,    │
│                             │                         │ topup_credits, mode, period* │
│ video_analyses              │ id (uuid)               │ youtube_id UQ, transcript    │
│                             │ youtube_id UNIQUE       │ jsonb, topics jsonb, summary │
│                             │                         │ jsonb, language, created_by  │
│ user_videos                 │ (user_id, video_id) UQ  │ accessed_at, is_favorite,    │
│                             │                         │ notes (free-form text)       │
│ user_notes                  │ id (uuid)               │ source CHK, source_id,       │
│                             │                         │ note_text, metadata jsonb    │
│ video_generations           │ id (uuid)               │ identifier, youtube_id,      │
│                             │                         │ counted_toward_limit, tier   │
│ image_generations           │ id (uuid)               │ youtube_id, counted, tier    │
│ topup_purchases             │ id (uuid)               │ stripe_payment_intent_id UQ, │
│                             │                         │ credits_purchased, amount    │
│ stripe_events               │ event_id (text PK)      │ created_at  (idempotency)    │
│ rate_limits                 │ id (uuid)               │ key, identifier, timestamp   │
│ audit_logs                  │ id (uuid)               │ action, resource_*, ip, ua,  │
│                             │                         │ details jsonb                │
│ pending_welcome_emails      │ id (uuid), user_id UQ   │ status CHK, attempts,        │
│                             │                         │ http_request_id (pg_net)     │
└─────────────────────────────┴─────────────────────────┴──────────────────────────────┘
```

### 2.1 ER 关系（精简版）

```
auth.users  1───1  profiles
   │                  │  topic_generation_mode, subscription_tier,
   │                  │  topup_credits, current_period_*, newsletter_subscribed
   │                  │
   │                  └───*  pending_welcome_emails (1 per user, UNIQUE)
   │
   ├───*  user_videos  *───1  video_analyses
   │       (is_favorite, accessed_at)        ▲
   │                                         │ created_by (NULL=匿名首播)
   ├───*  user_notes  *───1  video_analyses
   │
   ├───*  video_generations  *───?  video_analyses (ON DELETE SET NULL)
   ├───*  image_generations  *───?  video_analyses
   ├───*  topup_purchases   (Stripe payment_intent UNIQUE)
   └───*  audit_logs        (ON DELETE SET NULL → 用户删除后保留审计)

(无 FK)
   stripe_events           ← Stripe webhook 去重（仅 event_id PK）
   rate_limits             ← 滑动窗口计数（key + identifier + timestamp）
```

---

## 3. 表结构详解

### 3.1 `profiles` — 用户画像 + 订阅 + 余额

```
profiles
├─ id                                uuid PK  → auth.users.id (CASCADE)
├─ email / full_name / avatar_url
├─ free_generations_used             int  default 0   (legacy, 仍保留)
├─ topic_generation_mode             text CHECK ('smart','fast')  default 'smart'
├─ subscription_tier                 text CHECK ('free','basic','premium' / later 'free','pro')
├─ subscription_status               text CHECK (active|past_due|canceled|incomplete|trialing|NULL)
├─ stripe_customer_id                text  (idx)
├─ stripe_subscription_id            text
├─ subscription_current_period_start timestamptz   ── 30 天滚动窗口的锚点（free 用注册日推算）
├─ subscription_current_period_end   timestamptz
├─ cancel_at_period_end              bool  default false
├─ topup_credits                     int  CHECK >= 0   ── 一次性补充包余额
├─ newsletter_subscribed             bool  default true
├─ created_at / updated_at           timestamptz (auto-update trigger)
```

- 写入：`handle_new_user()` 在 `auth.users` 插入后自动建 `profiles` 行；`on_profile_created_queue_welcome_email` 触发器随后将一行排入 `pending_welcome_emails`。
- 计费窗口：Pro 用户使用 `subscription_current_period_start/end`；Free 用户用 `created_at + n*30d` 算当前周期（`subscription-manager.ts: resolveBillingPeriod`）。
- RLS：`SELECT/UPDATE` 仅本人；`service_role` 全权。

### 3.2 `video_analyses` — AI 结果缓存（公共可读）

```
video_analyses
├─ id                  uuid PK   default uuid_generate_v4()
├─ youtube_id          text UNIQUE NOT NULL  (idx)        ── 缓存命中键
├─ title / author / duration / thumbnail_url
├─ transcript          jsonb NOT NULL        ── TranscriptSegment[]
├─ topics              jsonb                 ── Topic[]
├─ summary             jsonb
├─ suggested_questions jsonb
├─ language            text  (idx)           ── ISO 语言码
├─ available_languages jsonb                 ── string[]
├─ model_used          text                  ── 写入时使用的 AI 模型
├─ created_by          uuid → auth.users(id)  (idx)        ── NULL = 匿名首次生成
└─ created_at / updated_at  timestamptz (auto-update trigger)
```

- **缓存命中**：`/api/check-video-cache` 通过 `eq('youtube_id', videoId)` 命中，命中后顺手 upsert 一条 `user_videos` 记录到当前用户。
- **写入入口**：`insert_video_analysis_server(...)` RPC。`saveVideoAnalysisWithRetry` 包装，遇到 FK 错误指数退避重试 3 次（应对新注册用户 profile 还没就绪的竞态）。
- **乐观更新**：存在记录时仅在 `EXCLUDED IS NOT NULL` 时覆盖（`COALESCE`），保证不被空字段覆盖。
- **所有权**：`update_video_analysis_secure` 对比 `created_by`：匿名记录任何登录用户可更新，否则只允许原创建者。
- RLS：`SELECT` 公开；`INSERT/UPDATE` 仅 authenticated；service_role 全权。

### 3.3 `user_videos` — 用户与视频的多对多 + 收藏

```
user_videos
├─ id            uuid PK
├─ user_id       uuid → profiles(id)        CASCADE   (idx)
├─ video_id      uuid → video_analyses(id)  CASCADE   (idx)
├─ accessed_at   timestamptz NOT NULL                  (idx)
├─ is_favorite   bool default false                    (idx)
├─ notes         text                                  ── legacy free-form notes
└─ UNIQUE (user_id, video_id)
```

- 写入策略：缓存命中或新生成时 `upsert(onConflict: user_id,video_id)` 并刷新 `accessed_at`。
- **容错**：`insert_video_analysis_server` 把这步包进 nested `BEGIN..EXCEPTION WHEN foreign_key_violation`，FK 失败只跳过这一行，**不会回滚** video_analyses（这是 `20260221120000_fix_video_save_transaction.sql` 的关键修复）。
- 兜底：`ensureUserVideoLink()`（`lib/video-save-utils.ts`）+ `20260122120000_fix_missing_user_videos.sql` 一次性补齐历史缺失链接。

### 3.4 `user_notes` — 笔记（多源 + 富 metadata）

```
user_notes
├─ id           uuid PK
├─ user_id      uuid → auth.users(id)      CASCADE  (idx)
├─ video_id     uuid → video_analyses(id)  CASCADE  (idx)
├─ source       text CHECK ('chat','takeaways','transcript','custom')  (idx)
├─ source_id    text                ── 例如 chat messageId / 段落 id
├─ note_text    text NOT NULL
├─ metadata     jsonb               ── NoteMetadata（transcript 时间戳/段索引/选中文本…）
├─ created_at / updated_at  timestamptz (set_user_notes_updated_at 触发器)
└─ INDEX (user_id, video_id)
```

- API：`GET/POST/DELETE /api/notes`、`GET /api/notes/all`，全部需要登录 + CSRF。
- RLS：完全按 `auth.uid() = user_id` 收紧。
- TS 形态：`Note` / `NoteWithVideo`（`lib/types.ts`）—— 客户端 `mapNote()` 把 `note_text` 重映射为 `text` 字段。

### 3.5 `video_generations` — 文本配额账本

```
video_generations
├─ id                    uuid PK
├─ user_id               uuid → auth.users(id) ON DELETE SET NULL
├─ identifier            text   ── 'user:<uuid>' 或匿名 hash
├─ youtube_id            text
├─ video_id              uuid → video_analyses(id) ON DELETE SET NULL
├─ counted_toward_limit  bool default true
├─ subscription_tier     text   ── 落账时的 tier 快照
├─ created_at            timestamptz
└─ Indexes:
   (user_id, created_at)
   (identifier, created_at)
   (user_id, youtube_id, created_at) WHERE counted_toward_limit = true   ── 去重
```

- **核心 RPC**：`consume_video_credit_atomically(...)`
  ```
  ┌──────────────────────────────────────────────────────────────┐
  │ BEGIN (SECURITY DEFINER)                                     │
  │   SELECT topup_credits FROM profiles WHERE id=$user FOR UPDATE
  │   ── 去重：同一 youtube_id 在窗口内已扣过 → 返回 ALREADY_COUNTED
  │   ── 否则：count(video_generations WHERE counted)             │
  │   ── base_remaining = max(0, base_limit - counted)           │
  │   ── total_remaining = base_remaining + topup_credits        │
  │   ── 若 0 → 返回 LIMIT_REACHED                                │
  │   INSERT video_generations(...)                              │
  │   IF base_remaining = 0 AND topup_credits > 0 THEN           │
  │       UPDATE profiles SET topup_credits -= 1                 │
  │   RETURN jsonb { allowed, generation_id, used_topup, ... }   │
  │ END                                                          │
  └──────────────────────────────────────────────────────────────┘
  ```
- 配额：`TIER_LIMITS = { free: 3, pro: 100 }` per 30 天。
- 历史回填（`backfill_existing_users.sql`）把老 `video_analyses` 拉成 `counted_toward_limit = false` 行，不占用新额度但保留分析。

### 3.6 `image_generations` — Gemini 图像配额账本

结构与 `video_generations` 一致，但**不消费 topup_credits**，仅按月度 base_limit 控制（`consume_image_credit_atomically`）。

### 3.7 `topup_purchases` + `stripe_events`

```
topup_purchases                       stripe_events
├─ id                     uuid PK     ├─ event_id  text PK
├─ user_id  → auth.users (CASCADE)    └─ created_at (idx desc)
├─ stripe_payment_intent_id  UNIQUE      用途：Webhook 幂等去重
├─ credits_purchased  CHECK > 0          每个 Stripe event 处理前先 INSERT，
├─ amount_paid (cents) CHECK >= 0        冲突即跳过
└─ created_at
```

- `topup_purchases` 仅 `SELECT own` + service_role；写入只在 webhook 中通过 service-role client 完成。
- 充值后调用 `increment_topup_credits(user, amount)` 原子加余额。

### 3.8 `audit_logs`

```
audit_logs
├─ id           uuid PK
├─ user_id      uuid → auth.users  ON DELETE SET NULL  (idx)
├─ action       text NOT NULL       (idx)
├─ resource_type text                ── SECURITY / AUTH / API
├─ resource_id   text
├─ details      jsonb               ── 自动 sanitize
├─ ip_address   text NOT NULL
├─ user_agent   text NOT NULL
└─ created_at   timestamptz desc    (idx)

Partial INDEX  WHERE action IN
   ('RATE_LIMIT_EXCEEDED','VALIDATION_FAILED',
    'UNAUTHORIZED_ACCESS','SUSPICIOUS_ACTIVITY')
```

- RLS：用户只能查自己的；写入策略 `WITH CHECK (true)`，由应用层 service-role 控制。

### 3.9 `rate_limits` — 通用滑动窗口

```
rate_limits
├─ id          uuid PK
├─ key         text   ── 'ratelimit:{endpoint}:{identifier}'  或 'guest-analysis'
├─ identifier  text   ── 'user:<uuid>' / 'anon:<sha256_16>' / guest token / 'ip:<sha256>'
├─ timestamp   timestamptz   (idx)
└─ Composite idx (key, timestamp DESC)
```

- 算法（`lib/rate-limiter.ts`）：
  1. 删 `timestamp < now - windowMs` 的旧行
  2. `count(*) where key=K and timestamp >= now-windowMs`
  3. ≥ max → 拒绝；否则 INSERT 一行
- 老化：`cleanup_old_rate_limits()` 默认删 31 天前数据（24 小时窗口的也由该函数兜底）。
- **匿名访客**（`lib/guest-usage.ts`）复用此表，`key = 'guest-analysis'`，`identifier` 为浏览器 cookie token + IP hash 双因子，命中其一即视为已用过。

### 3.10 `pending_welcome_emails` — 异步邮件队列

```
pending_welcome_emails
├─ id                uuid PK
├─ user_id           uuid → auth.users CASCADE   UNIQUE
├─ email / full_name
├─ send_at           timestamptz   ── 注册时间 + 5 分钟
├─ status            text CHECK (pending|processing|sent|failed|cancelled)
├─ attempts / max_attempts (default 3)
├─ last_attempt_at / last_error
├─ http_request_id   bigint        ── pg_net 请求 id
└─ created_at / updated_at  (auto-update)

Partial idx (status, send_at) WHERE status='pending'
Partial idx (status, http_request_id) WHERE status='processing'
```

调度（pg_cron）：

```
* * * * *   process_welcome_emails()
              SELECT FOR UPDATE SKIP LOCKED LIMIT 10
              status: pending → processing
              net.http_post(api_url + '/api/email/send-welcome',
                            internal_api_key from Vault)
              记录 http_request_id

* * * * *   handle_welcome_email_responses()
              JOIN net._http_response
              200 → status='sent'
              非200 → 退避重试 (send_at = now + attempts * 1min)
              超 max_attempts → 'failed'
              超 2 分钟无响应 → 重置或失败

0 3 * * 0   cleanup_old_welcome_emails()
              sent  > 30 天 → 删
              failed > 90 天 → 删
```

---

## 4. 物化视图（分析后台）

`20251202120000_analytics_dashboard.sql` 新建 5 张 materialized views，并提供 `refresh_analytics_views()` 一次性刷新（推荐外部 cron 每日触发）。

```
user_activity_summary    ← UNION(user_videos, video_generations, user_notes, audit_logs)
                          GROUP BY (user_id, activity_date)

user_growth_metrics      ← profiles 按 DATE(created_at)，含 tier 拆分
                          + 累计/新增 + daily_conversion_rate

revenue_metrics          ← profiles(active pro) × $10/mo  +  topup_purchases
                          → mrr_cents / topup_revenue / total_revenue

video_usage_metrics      ← video_generations + 关联 video_analyses
                          含 counted vs cached / 按 tier / TOP 100 popular_videos_json

feature_adoption_metrics ← profiles(mode) + user_notes(source) +
                          user_videos(is_favorite) + image_generations
```

辅助函数：
- `get_user_retention_cohorts(weeks)` — 周 cohort 留存矩阵
- `get_active_users_metrics(start,end)` — DAU / WAU / MAU + 比值

---

## 5. 关键 RPC 一览

| 函数 | 作用 | 调用方 |
| --- | --- | --- |
| `handle_new_user()` (TRIGGER) | `auth.users` → `profiles` 自动建档 | Supabase auth |
| `queue_welcome_email()` (TRIGGER) | `profiles` → `pending_welcome_emails` 排队 | DB |
| `update_updated_at_column()` / `trigger_set_user_notes_updated_at` | 更新 `updated_at` | profiles / video_analyses / user_notes |
| `insert_video_analysis_server(...)` | 安全写入 + nested user_videos link | `lib/video-save-utils.ts` |
| `update_video_analysis_secure(...)` | 带 `created_by` 所有权校验的更新 | `/api/update-video-analysis` |
| `consume_video_credit_atomically(...)` | 行级锁 + 去重的扣费 | 文本生成路由 |
| `check_video_generation_allowed(...)` | 只读预检 | `/api/check-limit` 等 |
| `consume_image_credit_atomically(...)` / `check_image_generation_allowed(...)` | 图像配额（不消耗 topup） | `/api/generate-image` |
| `consume_topup_credit(p_user)` / `increment_topup_credits(p_user, p_amount)` | topup 余额加减 | Stripe webhook / 兜底 |
| `get_usage_breakdown(user, start, end)` | 按 tier 聚合用量 | `lib/usage-tracker.ts` |
| `get_image_usage_breakdown(...)` | 同上，图像版 | image-generation-manager |
| `cleanup_old_rate_limits()` / `cleanup_old_welcome_emails()` | 清理 | 后台定时（应用 / pg_cron） |
| `process_welcome_emails()` / `handle_welcome_email_responses()` | 邮件队列处理 | pg_cron 每分钟 |
| `refresh_analytics_views()` / `get_user_retention_cohorts()` / `get_active_users_metrics()` | 分析 | 后台 / 仪表盘 |

---

## 6. 行级安全（RLS）总结

```
表                       SELECT          INSERT             UPDATE             DELETE
─────────────────────────────────────────────────────────────────────────────────────
profiles                 own + svc       (trigger only)      own + svc           svc
video_analyses           public          authenticated       authenticated       svc
user_videos              own + svc       own + svc           own + svc           own + svc
user_notes               own + svc       own + svc           own + svc           own + svc
video_generations        own + svc       own + svc           own + svc           svc
image_generations        own             own                  -                   -
topup_purchases          own + svc       svc                  svc                 svc
stripe_events            svc             svc                  svc                 svc
audit_logs               own             ANY (app-enforced)   svc                 svc
rate_limits              public read     public insert        -                   svc
pending_welcome_emails   svc             svc                  svc                 svc
```

> `svc` = `auth.jwt()->>'role' = 'service_role'`；`own` = `auth.uid() = user_id`。
> 写入 `audit_logs` 的 RLS 故意宽松（`WITH CHECK (true)`），由应用层 service-role 客户端把控。

---

## 7. 客户端持久化

```
┌─────────────────────────────────────────────────────────────────┐
│ Cookies (set in middleware / route handlers)                    │
│   sb-access-token / sb-refresh-token  (Supabase @supabase/ssr)  │
│   tldw_guest_token             httpOnly · 5y · sameSite=lax     │
│   tldw_guest_analysis_used     httpOnly · 5y · 标记游客已用     │
├─────────────────────────────────────────────────────────────────┤
│ localStorage                                                    │
│   tldw-mode-preference  : 'smart' | 'fast'                       │
│       └ 登录后镜像写入 profiles.topic_generation_mode            │
├─────────────────────────────────────────────────────────────────┤
│ sessionStorage                                                  │
│   pendingVideoId          : 登录前要绑定到账号的 youtubeId       │
│   limitRedirectMessage    : 限流触发后跳转主页时回显的提示       │
└─────────────────────────────────────────────────────────────────┘
```

- 登录流程：未登录用户先把当前 `videoId` 塞进 `sessionStorage.pendingVideoId` → 弹出 auth modal → 登录成功后回到首页/分析页，调用 `/api/link-video` 把视频绑定给当前用户（带指数退避，等 profile/视频就绪）。
- 客户端**不**缓存 transcript / topics / summary 到 localStorage；命中缓存完全靠 `video_analyses` 服务端命中。

---

## 8. 关键写入流程

### 8.1 视频分析保存（含竞态保护）

```
                /api/save-analysis  or  /api/generate-topics
                            │
                            ▼
          ┌────────────────────────────────────────┐
          │ saveVideoAnalysisWithRetry (3x, 500ms*) │
          │   supabase.rpc('insert_video_analysis_  │
          │                  server', {...})        │
          └────────────────────────────────────────┘
                            │
       SECURITY DEFINER  ▼
   ┌──────────────────────────────────────────────────────────┐
   │ video_analyses: INSERT (or UPDATE existing youtube_id)   │
   │     created_by = p_user_id (仅新增时)                     │
   │ ─────────────  nested BEGIN ───────────────              │
   │ user_videos: INSERT … ON CONFLICT (user_id,video_id)     │
   │              DO UPDATE SET accessed_at = now()           │
   │  EXCEPTION WHEN foreign_key_violation:                   │
   │      RAISE WARNING, 不回滚 video_analyses                │
   │ ─────────────  END nested ───────────────                │
   └──────────────────────────────────────────────────────────┘
                            │
                            ▼
                    return uuid (video_id)
```

兜底：`ensureUserVideoLink()` 在后续请求里发现缺链时补建。

### 8.2 配额扣费（去重 + 锁）

```
        前端发起生成 ──► /api/generate-topics
                               │
                               ▼
        consume_video_credit_atomically(user, youtube, …)
        ┌─────────────────────────────┐
        │ FOR UPDATE on profiles row  │  ← 防并发双扣
        │ ── 去重: 同 youtube_id 已扣过 │
        │      → ALREADY_COUNTED       │ (用户刷新页面不会被再扣)
        │ ── count counted             │
        │ ── base_remaining            │
        │ ── if 0 → LIMIT_REACHED      │
        │ INSERT video_generations     │
        │ if base=0 & topup>0 →        │
        │     UPDATE profiles -1       │
        └─────────────────────────────┘
                               │
                               ▼
                    返回 jsonb 给应用层
```

### 8.3 Stripe Webhook → 余额

```
POST /api/webhooks/stripe
  │
  ├─► INSERT INTO stripe_events(event_id) ON CONFLICT DO NOTHING
  │     若冲突 → 直接 200（已处理）
  │
  ├─► 解析 event：subscription / payment_intent
  │     UPDATE profiles SET subscription_* / topup_credits
  │     INSERT topup_purchases(stripe_payment_intent_id UQ)
  │     RPC increment_topup_credits(user, n)
  │
  └─► 200 OK  (中间件 matcher 排除 /api/webhooks，保证原始 body 不被改动)
```

### 8.4 欢迎邮件（5 分钟延迟 + 重试）

```
auth.users INSERT
   └─► handle_new_user() → INSERT profiles
        └─► queue_welcome_email() trigger
             └─► INSERT pending_welcome_emails(send_at = now + 5m)

[pg_cron 每分钟] process_welcome_emails()
   SELECT … WHERE status='pending' AND send_at <= now()
            FOR UPDATE SKIP LOCKED LIMIT 10
   net.http_post(<app_url>/api/email/send-welcome, X-Internal-API-Key)

[pg_cron 每分钟] handle_welcome_email_responses()
   JOIN net._http_response
       200  → status=sent
       非200 → status=pending, send_at += attempts*1min
       超时/超次 → status=failed
```

---

## 9. 设计要点

- **缓存为王**：`video_analyses.youtube_id` UNIQUE，所有用户共享同一份 AI 分析；`counted_toward_limit=false` 区分缓存命中与新生成，避免缓存命中也扣额度。
- **写入安全**：`SECURITY DEFINER` RPC + `created_by` 字段防止匿名缓存投毒；anon 创建的记录任何登录者可继续完善，已有 owner 的记录只接受 owner 更新。
- **金额一致性**：`topup_credits` 加扣全部走 RPC，扣费 RPC 一次事务内完成「去重 → 行锁 → 入账 → 减余额」。
- **数据保留**：用户删除时 `audit_logs.user_id`、`video_generations.user_id` SET NULL（保留行业数据），`user_notes`、`user_videos`、`topup_purchases`、`pending_welcome_emails` CASCADE。
- **横向扩展**：`pg_cron + pg_net + Vault` 把异步邮件做进数据库本地，省一个外部队列；rate_limits 表 + 物化视图 让分析不依赖外部数仓。
- **没有对象存储**：源视频走 YouTube 嵌入播放，AI 图像走 Gemini API，仅缩略图 URL（`thumbnail_url`）以字符串形式落库。
