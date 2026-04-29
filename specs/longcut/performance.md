# LongCut 性能设计与可承载容量

LongCut 是一个**完全无状态的 Serverless 应用**（Next.js 15 在 Vercel + Supabase Postgres + 第三方 AI 提供商），单台服务器或单进程的概念不存在；它的性能由四个杠杆决定：**缓存命中率**、**外部 AI 调用并发**、**Postgres 单机能力** 和 **Vercel Serverless 实例**。下面按层次拆开看。

---

## 1. 性能设计哲学（4 条主线）

```
   ┌──────────────────────────────────────────────────────────────┐
   │ 1. Cache-first         ─ 同 youtube_id 全用户共享分析结果    │
   │ 2. Parallel-first      ─ 任何能并行的 IO 都用 Promise.all*   │
   │ 3. Background-first    ─ 关键路径只做最少阻塞，其余进 BG     │
   │ 4. Atomic-first        ─ 写库走 RPC，避免 N+1 / race         │
   └──────────────────────────────────────────────────────────────┘
                          │
                          ▼ 共同体现在
   ┌──────────────────────────────────────────────────────────────┐
   │  关键路径只做： transcript fetch  +  AI 生成（带 fallback）  │
   │                  + 缓存命中可全部跳过                        │
   │  非关键路径都被 backgroundOperation 包裹：保存、suggested-   │
   │  questions、user_videos link、welcome email 等               │
   └──────────────────────────────────────────────────────────────┘
```

---

## 2. 一次"全新视频"分析的关键路径耗时拆解

```
  t=0
  │
  ├─ Browser → /api/check-limit            ~50–150 ms   (Supabase getUser + RPC)
  ├─ Browser → /api/check-video-cache      ~50–200 ms   (1 row by indexed youtube_id)
  │
  │  if cached  ──────────────────────────► 立刻返回 transcript+topics+summary
  │                                          (~200–400 ms 首字节)
  │
  │  if not cached:
  │  ├─ Promise.all                                        ↓ 并行
  │  │  • GET /api/transcript    ~1.5–6 s (YouTube InnerTube + 多客户端 fallback)
  │  │  • GET /api/video-info    ~150–400 ms (oEmbed + 备用)
  │  │
  │  ├─ Promise.allSettled                                 ↓ 并行
  │  │  • POST /api/generate-topics   ~6–30 s (Smart: map-reduce)
  │  │                                       ~3–8 s  (Fast: single call)
  │  │  • POST /api/generate-summary  ~3–8 s
  │  │  • POST /api/quick-preview     ~1–3 s (非阻塞 BG)
  │  │
  │  └─ background:
  │     • POST /api/save-analysis           不阻塞首屏
  │     • POST /api/suggested-questions     不阻塞首屏
  │
  └─ 首屏可交互
        ─ 缓存命中：~300 ms 级
        ─ 全新分析：~6–15 s（Fast 模式）/ ~10–35 s（Smart 模式）
```

---

## 3. 多层缓存体系（命中率是 P95 最大杠杆）

```
              ┌────────────────────────────────────────────────┐
              │ Layer 0: 浏览器内 React state                  │
              │   • topics / transcript / notes 留在内存       │
              │   • translation cache: Map<cacheKey, string>   │
              │   • CSRF token: 模块级单例 + cookie 兜底        │
              │   • mode preference: localStorage              │
              └────────────────────┬───────────────────────────┘
                                   │ miss
                                   ▼
              ┌────────────────────────────────────────────────┐
              │ Layer 1: Vercel Edge / CDN                     │
              │   • static page (/, /pricing, /privacy, /terms)│
              │   • Next.js generated chunks, fonts (Geist)    │
              │   • next.config images.remotePatterns 优化     │
              └────────────────────┬───────────────────────────┘
                                   │ miss
                                   ▼
              ┌────────────────────────────────────────────────┐
              │ Layer 2: Supabase video_analyses (按 youtube_id│
              │          UNIQUE + idx_video_analyses_youtube_id)│
              │   • 全用户共享：A 用户分析过的视频，B 用户立刻 │
              │     免费拿到，CACHED 标志位让 RPC 不扣额度     │
              │   • RPC isVideoCached() → 单行 lookup          │
              │   • 命中时 only 1 SELECT，完全跳过 AI 调用     │
              └────────────────────┬───────────────────────────┘
                                   │ miss
                                   ▼
              ┌────────────────────────────────────────────────┐
              │ Layer 3: Provider adapter 单例缓存             │
              │   (lib/ai-providers/registry.ts)                │
              │   • providerCache: Partial<Record<…>>          │
              │   • 一次 process 内只 new 一次 adapter         │
              └────────────────────┬───────────────────────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────────────┐
              │ Layer 4: AI Provider (cold call)               │
              │   • MiniMax / Grok / Gemini                    │
              │   • Gemini 还有内层 model cascade：2.5-flash-  │
              │     lite → 3-flash → 3-pro 自动降级            │
              └────────────────────────────────────────────────┘
```

### 缓存"复利"效应（白话版）

```
   一个热门视频（e.g. 知名播客片段）的 N 次访问：
     第 1 次：~10–35 s 全量分析，1 次扣费，写一行 video_analyses
     第 2~N 次：~300 ms 命中缓存，0 次 AI 调用，0 次扣费
                              │
   随着 video_analyses 表的增长，AI 调用成本 ≈ 不重复视频数 × 单次成本，
   而非"用户数 × 视频数"。命中率 80%+ 是稳定状态下的常态。
```

---

## 4. 并行化（关键路径压扁的核心）

```
   ai-processing.generateTopics (Smart mode)
   ───────────────────────────────────────────
   transcript[] ── chunkTranscript(5min, 45s overlap) ──► chunks[]
                                              │
                                              ▼
              ┌────────────────────────────────────────────┐
              │ Promise.all(chunks.map(chunk => provider   │
              │ .generate(buildChunkPrompt(chunk))))       │
              │ 每个 chunk 独立 AI 调用，IO 完全并行       │
              └─────────────────────────┬──────────────────┘
                                        ▼
                            dedupe + theme filter
                                        │
                                        ▼
                  segmentConfigs (前 60% / 后 40%)
                                        │
                                        ▼
              Promise.allSettled(reduce 调用 × 2 段)
                                        │
                                        ▼
              quote-matcher.findText (segments × topics)
                Promise.all on hydration

   ─────── 同一时刻并行 IO 数 ≈ chunks (3–8) + 2 reduce ≈ 5–10 ───────

   /analyze 页面侧：
   ────────────────
   const [transcriptRes, videoInfoRes] = await Promise.all([…])
   const [topicsRes, summaryRes] = await Promise.allSettled([…])
   suggestedQuestions / save-analysis / save user_videos → backgroundOperation()

   ─────── 客户端浏览器同时也只阻塞最长那条 ───────
```

`backgroundOperation(name, fn)` 是"火并忘"封装：吞掉异常、记日志、不影响 UI；保存视频分析、写 user_videos link、生成图片小抄、补 summary 等都用它跑。

---

## 5. 算法层面的优化（CPU 不是瓶颈，但关键路径必须毫秒级）

```
   引用定位 quote-matcher.ts
   ─────────────────────────
   一次 buildTranscriptIndex(transcript)：
      • fullTextSpace / fullTextNewline / normalizedText 三份字符串
      • wordIndex: Map<word, segmentIndices[]>  ── O(1) 反查
      • ngramIndex: Map<3gram, Set<segmentIdx>> ── 模糊检索可裁剪
      • 一次构建，整个会话复用

   findTextInTranscript() 三段式策略：
      1. boyerMooreSearch(fullText, target)         O(n+m)，常数极小
         ↓ miss
      2. boyerMooreSearch(normalized, normalize(t)) 容忍标点差异
         ↓ miss
      3. 用 wordIndex 收集候选 segment（top-k）→ 仅在 30-segment
         窗口内做 3-gram Jaccard，阈值 0.85
                                      │
                                      ▼
              避免对全转录做 O(n×m) 模糊匹配；最坏情况
              也只在 30 个 segment 内做一次相似度计算
```

`transcript-sentence-merger`、`transcript-format-detector` 在一次性预处理时跑（O(n)），整个会话只跑一次。`youtube-transcript-provider` 用 Android → Web → iOS 三客户端 fallback 是为了"成功率"而非性能，但每次只命中一个 → 99% 情况下首选直接成功。

---

## 6. 数据库层面的并发 / 一致性 / 索引设计

### 索引（迁移文件累计 40+ 索引，覆盖所有热查询）

```
 表                       关键索引                              覆盖的热路径
 ─────────────────────────────────────────────────────────────────────────────
 video_analyses    UNIQUE(youtube_id), idx_…_created_at    缓存命中 / 排序
                   idx_video_analyses_language             (后期多语言筛选)
                   idx_video_analyses_created_by           所有权检查
 user_videos       (user_id, video_id) UNIQUE              逐用户视频列表
                   idx_…_is_favorite, idx_…_accessed_at    收藏/最近访问
 user_notes        (user_id, video_id) 复合 + 单列索引     笔记快速读取
 video_generations (user_id, created_at)                   用量周期统计
                   (user_id, youtube_id, created_at)       去重检查
                   FILTER (counted_toward_limit=true)      partial index
 rate_limits       (key, timestamp DESC)                   滑动窗口计数
 audit_logs        (action, created_at DESC) partial       安全事件查询
 image_generations 同 video_generations 镜像               图像额度统计
```

### 用 Postgres RPC 把"检查 + 写入"做成一次原子事务

```
  consume_video_credit_atomically (RPC)
  ─────────────────────────────────────
   BEGIN;
     SELECT topup_credits FROM profiles WHERE id=:user FOR UPDATE; -- 行级锁
     -- 去重：已生成本周期同一 youtube_id → 直接返回 ALREADY_COUNTED
     SELECT COUNT(*) FROM video_generations WHERE … counted_toward_limit;
     IF total_remaining ≤ 0 THEN RETURN LIMIT_REACHED; END IF;
     INSERT INTO video_generations …;
     IF base_remaining ≤ 0 AND topup>0 THEN
        UPDATE profiles SET topup_credits = topup_credits - 1;
     END IF;
   COMMIT;
   → returns jsonb { allowed, reason, generation_id, used_topup, deduplicated }
```

```
   传统写法（需要 3-4 次 round trip 且会 race）：
        SELECT credits → if ok → INSERT → UPDATE
            ▲                                ▼
            └── 并发请求会双扣或漏扣 ────────┘

   RPC 写法：
        client → 1 RPC call → server-side single TX (FOR UPDATE) → done

   优点：
   • 1 次 round trip，连接池占用少（Supabase 连接是宝贵资源）
   • 行锁限定到本用户 profiles 行 → 不同用户互不阻塞
   • 自带去重：refresh 页面 / 重试不会双扣
```

`insert_video_analysis_server` 类似：UPSERT video_analyses + nested-BEGIN exception 隔离 user_videos FK 失败 → 即使 profile 还没准备好（OAuth 新用户竞态），主表也保住，后续兜底 `ensureUserVideoLink` 补链接。

### Rate limiting：滑动窗口 + 自清理

```
   RateLimiter.check(key, {windowMs, maxRequests}):
      DELETE FROM rate_limits WHERE timestamp < now-window  -- 自清理
      SELECT id  FROM rate_limits WHERE key=… AND ts >= start
      if count >= max → return blocked (with retryAfter)
      INSERT INTO rate_limits …
      → 索引 (key, timestamp DESC) 让 SELECT 是 index-only

   每次请求 ~3 次 SQL，~5–15 ms 在 Supabase 上。
   错误降级：catch 内部异常时 allow=true（开放失败 over 关闭失败）。
```

每张表都开了 RLS（`security_ownership` migration），数据隔离在 Postgres 层，无需在应用层逐条 user_id 校验。

---

## 7. AI Provider：弹性、成本与吞吐

```
        generateStructuredContent(params)
                    │
                    ▼
    primaryAdapter = getProvider(env.AI_PROVIDER)
                    │
                    ▼
    try primary.generate(rest)
            │
            ├── ok ──► return
            └── retryable err (429 / 5xx / timeout / overload)
                    │
                    ▼
            getProviderFallbackOrder(primary, available)
                    │ → 选一个有 API key 的 provider
                    ▼
            fallbackAdapter.generate(rest) → return
            (再失败抛原始 error)

    Gemini adapter 内层还有 model cascade：
       gemini-2.5-flash-lite → gemini-3-flash → gemini-3-pro
       (前者廉价快速；过载时自动升)

    每次 fetch 都带 AbortController + timeoutMs（默认无限，
    生成场景在 ai-client 层传入，30–60s 范围）。
```

### Provider 设计带来的吞吐特性

- **多 Provider 并联可用**：3 家 API key 都配上时，单 Provider 短时被限速不会拖垮 LongCut。
- **Adapter 单例**：HTTP client（fetch / GoogleGenerativeAI）在进程内复用，避免每次新建 TCP/TLS。
- **timeout + abort 双保险**：MiniMax/Grok 用原生 AbortController；Gemini 用 `Promise.race`。
- **结构化输出强约束**（Zod → JSON Schema）：减少 AI 返回非法 JSON 的重试，省 token、省时间。
- **Smart vs Fast 可调**：Smart 是 map-reduce 多次调用；Fast 一次调用直接出 5 条 highlight，节省 token 60–80%。`forceFullTranscriptTopicGeneration` 让 Grok 一次喂全文不分块（Grok 上下文够大）。

---

## 8. 前端的资源管理

```
   AbortManager (lib/promise-utils.ts)
   ───────────────────────────────────
   const abortManager = useRef(new AbortManager());
   abortManager.current.createController('topics', 60_000); // timeout
   …fetch(url, { signal: abortManager.current.getSignal('topics') })…

   useEffect cleanup:
      return () => abortManager.current.cleanup();   // 卸载/重新进入全部 abort

   ⇒ 用户在 topics 还没回来时切走、或切换主题时，旧请求立刻中断；
     既省服务器算力，也防内存堆积。

   Translation Batcher
   ───────────────────
   queue: TranslationRequest[]      ← 多个 useTranslation hook 调用
        │  20 ms debounce
        ▼
   processNextBatch (单飞 lock)
        │
        ▼
   groupByLanguage → 每组合并成一次 fetch /api/translate
        │  最多 1000 条 / 批 ；批间 200ms throttle
        ▼
   写回 cache: Map<cacheKey, translation>

   ⇒ 同一段 transcript 滚动时被反复请求 → 命中 cache，0 网络
   ⇒ 多段同时请求 → 合并为 1 次 RPC，省 round trip 也省 AI token

   AuthProvider 的可见性优化
   ─────────────────────────
   document.visibilitychange:
      隐藏 > 30 s 才刷新 session + 清 CSRF cache
      避免 alt-tab 触发无谓 supabase.auth.getSession() 调用
```

---

## 9. Vercel Serverless / Next.js 部署侧

```
   Edge middleware (middleware.ts) ── 跑在最靠近用户的 region
     • CSP / HSTS / X-Frame 头
     • Supabase session refresh（一次 HTTP 到 supabase.co）
     • 不命中文件后才进入 Lambda
     • 排除了 /api/webhooks/*（保留原始 body 给 Stripe 校验）

   Node.js Lambda (/api/*/route.ts)
     • 按路由按需冷启动；常用路由保持 warm
     • 每个 route handler stateless，可水平无限扩
     • runtime = 'nodejs' 显式声明：webhooks/stripe + email/send-welcome
     • 默认 10 s 超时（Hobby）/ 60 s（Pro）/ 900 s（Enterprise）
       AI 路由建议放 Pro 帐号，topic generation 30s+ 才安全

   Static / ISR
     • 落地页、价格、隐私、条款 完全静态
     • sitemap.ts / robots.ts 走 ISR

   Turbopack：dev 与 build 都用 Turbopack（package.json scripts）
     • 编译时间是原生 webpack 的 1/3 ~ 1/5
     • 主要影响开发体验，不直接影响生产 P95
```

---

## 10. 容量估算：能"撑多少用户"？

容量取决于"用户在做什么"。把场景拆开估：

### 假设单位（基于代码里的硬限制）

```
   匿名访客  : 1 video / 30 days (guest cookie + IP hash)
   注册免费  : 3 videos / 30 days
   Pro 订阅  : 100 videos / 30 days  + Top-up (+20)
   Chat      : 10 / min (anon), 30 / min (auth)
   Translation: 100/min (anon), 500/min (auth)
   API 一般  : 60 / min
```

### 月活规模估算（限制因素从轻到重）

```
                        │  100 DAU │  1k DAU │ 10k DAU │ 100k DAU
   ─────────────────────┼──────────┼─────────┼─────────┼──────────
   分析视频/日 (估)     │   ~150   │  ~1500  │ ~15000  │ ~150000
   AI 调用/日 (Smart)   │ ~600–1k  │ ~6k–10k │~60k–100k│  ~600k+
   AI 调用/日 (含 Fast) │   ~300   │  ~3k    │  ~30k   │  ~300k
   缓存命中节省 (~70%)   │  -210    │  -2.1k  │  -21k   │  -210k
   有效 AI 调用/日      │  ~90–300 │ ~0.9–3k │ ~9–30k  │ ~90–300k
   Postgres 写入/日     │ ~500–2k  │ ~5–20k  │~50–200k │~500k–2M
   Postgres 读取/日     │  ~3–10k  │ ~30–100k│ ~300k–1M│   ~3–10M
   Vercel 调用/日       │  ~5–20k  │ ~50–200k│ ~500k–2M│   ~5–20M
   ─────────────────────┴──────────┴─────────┴─────────┴──────────

   备注：DAU≈MAU/3；活跃用户每日平均生成 1.5 视频；缓存命中率 70%。
```

### 各层瓶颈位置

```
        DAU
        │
        │ 能力曲线（基于代码当前实现）
   100M ┤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Vercel/CDN 静态层
        │                              ╭─── (理论无限，按 Vercel 套餐扩)
    10M ┤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
        │                       ╭─── Postgres 写吞吐（>=50k tps，还有头部）
     1M ┤━━━━━━━━━━━━━━━━━━━━━━━╯
        │                ╭─── AI provider RPS 上限 ┐
   100k ┤━━━━━━━━━━━━━━━━╯  约 3–5k req/min/key   │
        │           ╭─── 单 Supabase 实例连接池   │ 这是当前默认配置
    10k ┤━━━━━━━━━━╯ pgbouncer ~200 conns         │ 下的天花板
        │     ╭─── Vercel Hobby: 100GB-h/month   │ ▼
     1k ┤━━━━╯ 默认 10s 超时不够 AI 30s+         │
        │                                         │
    100 ┤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
        └────────────────────────────────────────────────► 时间 / 需要的扩容动作
```

#### 解读

- **0–~1k DAU**：当前代码 + Vercel Pro + Supabase Free/Pro + 至少 1 家 AI 提供商即可跑顺，不需要任何改动。
- **~1k–10k DAU**：要做三件事：
  1. **配齐 3 家 AI Provider 的 API key**（让 fallback 真正生效，避免单家 quota 抖动）
  2. **Supabase 升级到付费实例 + 调高 pgbouncer 连接池**（~200 → ~500/1000）
  3. **Vercel Pro / Enterprise**（max 60s/900s 超时让 Smart 模式不会被截断）
  - 缓存命中率随用户基数线性升（同样的视频被更多人看），AI 成本曲线开始变缓。
- **~10k–100k DAU**：第一个真瓶颈是 **AI 提供商的 RPM/TPM**（典型 600–6000 RPM，依套餐）。需要：
  1. **企业级 API 配额**（MiniMax / xAI / Google 都支持商用 RPM 调高）
  2. **`rate_limits` 表归档**（每 24h 自动清理已经在做，但行数大时考虑分区）
  3. **Stripe 事件 / audit_logs 分表 / TTL**（这两张是单调追加表）
  4. **video_analyses.transcript jsonb 过大时**，热门视频的 SELECT * 占带宽 → 拆表或字段裁剪。
  5. **`/api/random-video` 已经显式 SELECT 列**，避免拉 100KB 转录字段。
- **~100k+ DAU**：架构层面要：
  1. **AI 调用边缘化**：把 transcript fetch 和首屏 chat 分离到后台 queue（如 Inngest / Trigger.dev），靠 webhook 或 SSE 把结果推回浏览器，不让 AI 30s 调用占住 Lambda 实例。
  2. **冷热数据分层**：`video_analyses` 按 created_at 分区，旧视频转 jsonb 压缩或 S3。
  3. **Read replica**：所有 GET 走只读副本，写仍然主库。
  4. **CDN 缓存 `/v/[slug]`**：公共视频页带 SSR + 长 TTL，几乎所有热视频访问 0 后端调用。

### "在不改代码的情况下"的稳态承载

```
   Vercel Pro + Supabase Pro + MiniMax 商用 + (Grok 或 Gemini 备用)
   ── 缓存命中率 ~70% ──
   ≈ 月活 (MAU) 30,000  /  日活 10,000  /  视频生成 ~10–15k 次/日
   ── 成本主导 ──
   AI tokens：$/月 取决于平均视频时长与命中率（Smart Mode 单次 ~$0.05–0.20）
   Vercel：$20–500/月（Pro→Enterprise）
   Supabase：$25 起；常规读写完全够用
```

数字是估算，具体值随视频时长（影响 chunk 数）、用户行为（chat 频率）、命中率而变。代码里的限速参数都集中在 `lib/rate-limiter.ts` 和 `lib/subscription-manager.ts`，扩容时只需调常量即可。

---

## 11. 关键性能机制速查表

```
   主题             代码位置                    关键设计
   ───────────────────────────────────────────────────────────────────────
   缓存命中跳过 AI   /api/check-video-cache    youtube_id UNIQUE 索引
                    /api/save-analysis (cached
                     标志位 不扣额度)
   原子额度消费      consume_video_credit_…    profiles 行锁 + 单事务 + 去重
                    consume_image_credit_…    image_generations 同结构
   并行 AI 调用      ai-processing.ts          chunk × Promise.all + reduce ×
                                              Promise.allSettled
   Provider fallback registry.generateStruct- 自动检测 retryable err 切换
                    uredContent
   Gemini 模型降级   gemini-adapter            flash-lite → flash → pro
   引用对齐 O(n)     quote-matcher             Boyer-Moore + ngram index
   翻译批处理        translation-batcher.ts    20ms debounce + lang grouping
   断网/超时清理     promise-utils.AbortManager 卸载即 abort 全部
   非阻塞背景任务    promise-utils.background- save / link / suggested
                    Operation                  questions / welcome email
   速率限制          rate-limiter.ts           Supabase 表 + 滑动窗口 + 自清
                                              理 + 错误降级 allow
   Webhook 幂等      stripe_events 表          PK = event.id 加锁
   YouTube 字幕容错  youtube-transcript-       Android → Web → iOS 三客户端
                    provider                  + 错误码细分
   读写隔离          supabase/admin (service-  webhook / 后台脚本绕过 RLS
                    role)                     用户路径用 anon key + RLS
   静态资源          next.config.ts            images.remotePatterns 限定
                                              i.ytimg.com 走 Vercel 优化
   Edge middleware   middleware.ts             session refresh 跑在 edge
                                              避开冷启动
   字幕格式探测      transcript-format-        启发式：标点率 + 平均长度
                    detector / sentence-merger 老格式才合并
```

---

## 12. 性能与可扩展性的"边界条件"

```
   ⚠ Lambda 超时    AI 路由若放 Hobby（10s）会被截断；Smart 模式必须
                   ≥ 60s。代码本身用 timeoutMs 配 AbortController，但
                   要看部署套餐。

   ⚠ 大视频         transcript 段数>5000 时 quote-matcher buildIndex
                   仍然 O(n)，但 reduce prompt 会变长 → 可能撞 token 上限。
                   ai-processing 已用 chunkTranscript 切片缓解。

   ⚠ rate_limits 表 自清理是惰性 (DELETE on each check)，DAU 100k+ 时这张
                   表会变大，建议加 TTL 或 cron。

   ⚠ Translation    LLM 翻译比 Google Translate API 贵且慢；现在的批处理
                   器最大 1000 条/批，一次大视频翻译可能 1–2 次 AI 调用，
                   token 成本随语言数量线性增加。

   ⚠ Supabase conn  RPC + RLS 都靠连接池；高并发时务必用 pgbouncer 模式
                   并适当增加 max conn，否则会出现 503。

   ⚠ webhook 顺序   Stripe webhook 重试时，stripe_events 表保证幂等，但
                   subscription.updated 顺序不保证；handleSubscription-
                   Updated 用全字段覆盖避免乱序丢字段。
```

---

## 13. 一句话总结

**LongCut 的高性能不是来自单点优化，而是"缓存让 AI 调用变稀有 + 并行让等待变最短 + RPC 让数据库变快 + Background 让 UI 不卡"四件事的复合：缓存命中即 ~300 ms 出结果，未命中也只阻塞最长那条 IO；前端 AbortManager 防泄漏，后端 RPC 防 race；Provider 单例 + 自动 fallback 让单家 AI 抖动不致整体崩溃。在当前代码 + 合理的 Vercel/Supabase/AI 配额下，可以稳态服务约 1 万 DAU 量级用户；继续扩展到 10 万 DAU 主要靠提升 AI 配额和数据库副本，无需重写架构。**
