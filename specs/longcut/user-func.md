# LongCut 项目功能全景梳理

LongCut 是一个基于 Next.js 15 的 AI 视频学习工作台，核心定位：把动辄一小时的 YouTube 视频，转化为结构化的「精华片段 + 摘要 + 对话 + 笔记」学习空间。

## 整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                       LongCut Application                             │
├──────────────────────────────────────────────────────────────────────┤
│  Frontend  : Next.js 15 App Router · React 19 · Tailwind v4 · shadcn │
│  AI Layer  : MiniMax / Grok / Gemini  (Provider 适配器 + 注册表)      │
│  Data      : Supabase (Auth · Postgres · RLS · 速率限制)              │
│  Billing   : Stripe (订阅 / Top-up 充值 / Webhook)                    │
│  Email     : Postmark (欢迎邮件 / 月报 / 退订)                        │
│  Security  : CSP · CSRF · 体积限制 · IP 哈希 · 审计日志                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 一、视频摄取与转写 (Ingestion)

> **一句话**：把任意 YouTube 链接解析出 videoId，并行拿到 oEmbed 元数据与字幕（YouTube InnerTube 三身份免费优先 / Supadata 付费兜底），命中 `video_analyses` 缓存则直接秒开——零摩擦输入、低成本拿料、可降级。

```
┌─ YouTube URL ──┐    ┌──────────────┐    ┌──────────────────────────────┐
│ 用户粘贴链接   │───▶│ extractVideoId │──▶│ /api/video-info              │  oEmbed + 元数据
└────────────────┘    └──────────────┘    ├──────────────────────────────┤
                                          │ /api/transcript              │  双通道转写
                                          │  ① YouTube InnerTube (免费)  │
                                          │  ② Supadata API   (付费兜底) │
                                          └──────────────────────────────┘
```

| 功能 | 说明 | 价值 |
|---|---|---|
| **URL 解析** (`lib/utils.ts: extractVideoId`) | 兼容多种 YouTube 链接形态（watch、youtu.be、shorts、嵌入） | 用户无需关心格式，零摩擦输入 |
| **双通道字幕抓取** (`/api/transcript`) | 优先 YouTube InnerTube 直连（三身份轮换，免费）；失败且配置了 `SUPADATA_API_KEY` 时回退 Supadata API（付费，按用量计费，失败返回 `noCreditsUsed: true`） | 默认零成本，YouTube 反爬命中时仍可保证转写可用性 |
| **元数据获取** (`/api/video-info`) | 调用 YouTube **oEmbed** (`youtube.com/oembed?url=...`) 拿标题、作者、缩略图；缩略图失败时回退到 `img.youtube.com/vi/{id}/maxresdefault.jpg`（注：oEmbed 不返回时长，`duration` 字段恒为 0） | 零鉴权、零成本拿到卡片渲染所需的核心字段 |
| **缓存预检** (`/api/check-video-cache`) | 处理前先查 `video_analyses` | 已分析过的视频 0 秒打开，节省 AI Token |

---

## 二、AI 多 Provider 适配层

> **一句话**：用统一适配器抽象屏蔽 MiniMax / Grok / Gemini 的差异，按 `AI_PROVIDER` 配置 + 凭据可用性自动选型，可重试错误自动切到候补 Provider，文本生成可换厂商、图像生成始终保留 Gemini——多供应商解耦、抖动可降级、按成本/质量自由切换。

```
       ┌──────── lib/ai-client.ts (统一入口) ────────┐
       │                                              │
       ▼                                              ▼
┌──────────────────────┐                ┌──────────────────────┐
│ provider-config.ts   │                │ registry.ts          │
│ · 解析 AI_PROVIDER   │                │ · 调度 generate*()   │
│ · 凭据可用性回退     │                │ · 结构化输出 schema  │
└──────────────────────┘                └──────────────────────┘
       │                                              │
       ▼                                              ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ MiniMax    │  │ Grok (xAI) │  │ Gemini     │
│ adapter    │  │ adapter    │  │ adapter    │
└────────────┘  └────────────┘  └────────────┘
```

| 功能 | 一句话总结 | 说明 | 价值 |
|---|---|---|---|
| **Provider 注册表** (`registry.ts`) | 工厂 + 缓存 + 凭据守卫，一行 `getProvider()` 拿到当前生效的 adapter | 三个 adapter 工厂按 `ProviderKey` 注册；`providerEnvGuards` 校验 `XAI_API_KEY` / `GEMINI_API_KEY` / `MINIMAX_API_KEY`；缺凭据则按优先级降级，最终回落到 grok | 避免单一供应商绑定，凭据缺失也不崩，可按成本/质量切换 |
| **结构化输出** (`types.ts: ProviderGenerateParams`) | Provider 必须吐回 schema 校验过的 JSON，前端直接消费 | 共享 Zod schema 在 adapter 内强制校验响应；非法 JSON 由 `lib/json-utils.ts` 兜底清洗 | 输出可信、强类型，前端无需防御性解析 |
| **超时 + 自动 Fallback** (`generateStructuredContent`) | 主 Provider 命中 429 / 5xx / overload / timeout 时**自动切到候补** | `isRetryableError` 关键字匹配；`getFallbackProvider` 按 `getProviderFallbackOrder` 取次优；显式指定 `provider` 参数则跳过 fallback 直接抛错 | 在供应商抖动时无人工介入即恢复，长任务（topics/summary）成功率显著提升 |
| **图像生成保留 Gemini** (`/api/generate-image`) | 文本通道可任意切，但作图固定走 Gemini，仍依赖 `GEMINI_API_KEY` | 文本 adapter 切到 MiniMax/Grok 时，图像路由独立调用 Gemini，由 `image-generation-manager.ts` 控额度 | 让 AI 对话能输出可视化"小抄"，不被文本 Provider 选型绑架 |

---

## 三、AI 内容生成五件套（并行）

> **一句话**：拿到 transcript 后并行触发五条独立 AI 流水线（精华片段 / 结构摘要 / 闪电预览 / 推荐问题 / 金句），任一失败不阻塞其他，1–2 秒首屏、60 秒内完成全套——其中精华片段按用户偏好走 **Smart**（长视频用 proModel 单次扫全文，跨片段叙事更连贯，慢且贵）或 **Fast**（始终 fastModel，长视频走 5 分钟分片并行 map-reduce，快约 30% 且省钱），把一段转写**一次性**变成五种可消费的学习物料。

```
            ┌─── transcript (5–60 min 文本) ──┐
            │                                  │
   ┌────────┼───────┬──────────┬──────────┬───┴────────┐
   ▼        ▼       ▼          ▼          ▼            ▼
generate-  generate- quick-   suggested-  top-       chat
topics     summary   preview  questions   quotes     (按需)
(精华片段) (结构摘要) (秒级预览) (推荐问题) (金句)    (对话)
   │
   ├── smart 模式：proModel 单次扫全文（>30min）→ 失败兜底 chunked
   └── fast  模式：始终 fastModel，长视频 chunked map-reduce
```

### 1. 精华片段 / Highlight Reels (`/api/generate-topics`)

**Smart 模式**（默认 / 深度优先）
- **模型**：长视频（>30min）用 **proModel**，短视频用 fastModel
- **策略**：**单次全文扫描** `runSinglePassTopicGeneration`，把完整 transcript 一次喂给大模型，直接输出 ≤5 个 topics
- **降级**：单次返回空时才回落到 chunked map-reduce 流水线（与 Fast 同管线）
- **适用**：> 30min 的访谈 / 长演讲 / 教程 / 纪录片——跨片段叙事呼应靠完整上下文才能拉通
- **代价**：慢（30–60s）+ 贵（Pro 模型 + 长 context）

**Fast 模式**（速度优先，~30% faster）
- **模型**：永远 fastModel，不上 proModel
- **策略**：长视频走 **chunked map-reduce**——5 分钟分片 (`DEFAULT_CHUNK_DURATION_SECONDS = 5*60`) + 45s overlap → 每片并行抽 ≤2 个候选 → 按 60% 时间轴拆"前 3/5 + 后 2/5"两段并行 reduce 出 3+2=5 个 topic；短视频先试单次扫描，失败再走 chunked
- **副产物**：chunked 流水线天然产出 `candidateTopics` 候选池
- **适用**：< 30min 视频（与 Smart 实际产出几乎一样，但更快）/ vlog / 直播回放 / 批量处理 / 配额紧张场景

**两个模式共用能力**
- **「换主题」再生成**：通过 `excludeTopicKeys` 排除已用 candidates 后重跑管线，**Smart/Fast 都支持**
- **Theme Selector**：从候选池提取关键词主题，用户点击主题可生成专属片段（结果缓存到 `themeTopicsMap`）
- **Provider 自动 fallback**：主 Provider 失败时按 `getProviderFallbackOrder` 切换次优 Provider 重试

**默认值**：`mode = 'smart'`（`ai-processing.ts:768/1182`），用户偏好通过 `useModePreference` 写入 profile + localStorage。

**价值**：把 60 分钟视频压缩成 5 个可点播的小段，配合 Play All 链式播放，10 分钟看完核心。

### 2. 结构化摘要 (`/api/generate-summary`)
- 长文本分块 → 多步 prompt 合成。
- **价值**：先看摘要决定要不要深入，节省时间。

### 3. 闪电预览 (`/api/quick-preview`)
- 在主流程并行的非阻塞后台任务。
- **价值**：用户进入页面 1–2 秒内就有反馈。

### 4. 推荐问题 (`/api/suggested-questions`)
- 主题完成后后台触发 + `suggested-question-fallback.ts` 兜底。
- **价值**：解决「不知道问什么」的冷启动。

### 5. 金句萃取 (`/api/top-quotes`)
- **价值**：可直接保存到笔记或分享。

---

## 四、双栏分析工作台 `/analyze/[videoId]`

> **一句话**：左栏放 YouTube 播放器 + 精华片段卡片 + 时间轴片段着色，右栏用 Tabs 切换 Summary / Chat / Transcript / Notes，所有组件通过统一的 `PlaybackCommand`（SEEK / PLAY_TOPIC / PLAY_SEGMENT / PLAY_ALL / PLAY_CITATIONS）共享一致的播放状态——视频与文本上下文同屏联动、点哪播哪、看完所有精华一键跑完。

```
┌─────────────── Video Header (标题/作者/收藏/分享) ────────────────┐
├──────────────────────────────┬─────────────────────────────────────┤
│  YouTubePlayer               │  RightColumnTabs                    │
│  (自定义包装，集中播放控制)  │  ┌──────┬──────┬───────────┬──────┐ │
│                              │  │Summary│ Chat │Transcript │Notes │ │
│  ────────────────────        │  └──────┴──────┴───────────┴──────┘ │
│  HighlightsPanel             │                                     │
│   ├─ ThemeSelector (主题切换)│  · Summary  : Markdown 摘要         │
│   ├─ Topic Cards (彩色卡片)  │  · Chat     : 带引用的 AI 对话      │
│   └─ Play All / 单段播放     │  · Transcript: 与播放同步高亮       │
│                              │  · Notes    : 选段/对话即时记录     │
│  VideoProgressBar (片段时间轴)│                                     │
└──────────────────────────────┴─────────────────────────────────────┘
```

| 子功能 | 说明 | 价值 |
|---|---|---|
| **集中播放命令** (`PlaybackCommand`) | `SEEK / PLAY_TOPIC / PLAY_SEGMENT / PLAY_ALL / PLAY_CITATIONS` 七种命令 | 多组件共享一致播放状态，避免相互打架 |
| **Play All 链式播放** | 主题间自动跳转 | "看完所有精华"一键体验 |
| **Citation 播放模式** | 按对话引用列表逐段播放 | 对答案"求证"非常顺滑 |
| **进度条片段着色** | 主题区间在时间轴上以颜色标记 | 视觉化"信息密度地图" |

---

## 五、Transcript 引擎（对齐 + 检索）

> **一句话**：用 Boyer-Moore 精确匹配 → 归一化匹配 → 3-gram Jaccard 模糊匹配三段式策略，把 LLM 吐出的引文（可能不逐字、有标点差异）回锚到 transcript 的精确 segmentIdx + charOffset，再叠加句子合并器和多格式字幕探测——让"AI 论断"和"原文时间点"在字符级精度上对齐，所有引用都能一键跳回视频。

```
TranscriptViewer ─┬─ 与播放时间同步高亮当前句
                  ├─ 点句子跳转 (PLAY_SEGMENT)
                  ├─ 选中文本 → SelectionActions (引用/笔记/翻译)
                  └─ 字符级 offset 高亮（精确到子句）

QuoteMatcher (lib/quote-matcher.ts)
  ├─ Boyer-Moore 精确子串
  ├─ 归一化匹配（去标点/大小写）
  ├─ 3-gram Jaccard 模糊匹配
  └─ 回填 segmentIdx + charOffset
```

| 功能 | 价值 |
|---|---|
| **多策略引文回锚** | LLM 输出的引文不一定逐字匹配，模糊匹配也能落到正确时间点 |
| **句子合并器** (`transcript-sentence-merger.ts`) | 拼接断碎字幕成完整句子，阅读体验大幅提升 |
| **格式探测** (`transcript-format-detector.ts`) | 适配多语言/多格式字幕，兼容更多视频源 |
| **导出对话框** (`transcript-export-dialog.tsx` + Pro upsell) | 导出全文/精华，免费用户看到升级提示 — 商业化转化点 |

---

## 六、AI Chat（带引用 + 图像）

> **一句话**：把对话上下文严格锁在 transcript 内（防幻觉），Provider 返回 `{answer, citations[]}` 后用引用回锚把每个论断打上 `[1][2]` 上标——点击跳转对应视频秒、"Play Citations" 一键串播全部引用，会话中需要可视化时调 Gemini 文生图——让 AI 的每一句话都"有出处、可回看、可看图"。

```
用户提问 ──▶ /api/chat ──▶ Provider ──▶ JSON {answer, citations[]}
                                              │
                                              ▼
                                  Citation 解析回锚 transcript
                                  · 渲染上标 [1][2]
                                  · 点击 → 跳转视频对应秒
                                  · "Play Citations" → 串播所有引用
```

| 功能 | 说明 | 价值 |
|---|---|---|
| **基于转写的问答** | 上下文严格限定在视频内容，避免幻觉 | 学习场景下的可信问答 |
| **引用上标 + 时间戳** | 每个论断带可跳转出处 | 验证答案，深度回看 |
| **会话内文生图** (`/api/generate-image`) | Gemini 出图，可在对话中渲染"概念小抄" | 把抽象内容图像化，便于记忆 |
| **限流降级** | Provider 限流时提供友好回退文案 | 故障时仍可继续使用 |

---

## 七、笔记系统

> **一句话**：从 transcript 选段、Chat 对话、金句 takeaways、自由输入四个来源把"洞见"沉淀成 Note，metadata 保留原始上下文（视频 ID、时间戳、字符 offset），单视频在右栏即时编辑、跨视频在 `/all-notes` 聚合搜索/筛选——把零散的"看视频灵感"变成可复用、可回跳的个人知识库。

```
┌─────────────────── Note Sources ───────────────────┐
│  chat       takeaways      transcript      custom  │
└─────┬─────────┬──────────────┬───────────────┬─────┘
      │         │              │               │
      ▼         ▼              ▼               ▼
   notes-panel.tsx  ◀──── csrfFetch ────▶  /api/notes (CRUD)
      │
      └── /all-notes (跨视频聚合)
              ├─ 搜索 / 筛选 / 排序
              ├─ Markdown 渲染
              └─ 附带视频缩略图与时间戳
```

| 功能 | 价值 |
|---|---|
| **多来源笔记** | 选段、聊天、金句、自由记，元数据保留上下文 — 任何洞见都能一键留存 |
| **跨视频笔记面板** `/all-notes` | 按视频/时间/来源筛选 — "知识库化"个人学习资产 |
| **时间戳回跳** | 笔记里点击时间 → 跳回原视频对应位置 — 复习无缝衔接 |

---

## 八、用户与个人空间

> **一句话**：匿名状态先用、登录后通过 `/api/link-video` 把已分析视频回填到账号（零数据丢失），围绕 `/my-videos`（历史 + 收藏）/ `/all-notes`（笔记）/ `/settings`（默认 mode 等偏好）/ `/v/[slug]`（SEO 分享页）/ `/pricing` 几条路由组成个人空间，偏好通过 `useModePreference` 同时写入 profile + localStorage——降低注册摩擦、最大化留存与口碑传播。

```
/                  → 落地输入页（含 mode 选择 + 限流提示登录）
/analyze/[videoId] → 主工作台
/v/[slug]          → 公开/分享页（SEO 友好）
/my-videos         → 历史 + 收藏（搜索/快速继续）
/all-notes         → 全部笔记
/settings          → 资料、密码、用量、默认 mode
/pricing           → Free / Pro 价格页
```

| 功能 | 价值 |
|---|---|
| **匿名 → 登录绑定** (`/api/link-video` + `verify-video-link`) | 未登录也能先用，登录后历史不丢失，降低注册摩擦 |
| **收藏系统** (`/api/toggle-favorite`) | 标星常用视频，快速回看 |
| **偏好持久化** (`useModePreference`) | smart/fast 写入 profile + localStorage，一次设置永远生效 |
| **`/v/[slug]` 分享路由** | 可分享 SEO 友好链接，增长/口碑传播 |

---

## 九、计费与订阅 (Stripe)

```
┌── /pricing ──┐    Free  : 3 视频 / 30 天
│              │    Pro   : 100 视频 / 月  + 翻译 + 导出 + 更高图像额度
└──────┬───────┘
       ▼
  /api/stripe/create-checkout-session ──▶ Stripe Checkout
  /api/stripe/create-portal-session    ──▶ 客户自助门户
  /api/stripe/confirm-checkout         ──▶ 支付完成回调
  /api/webhooks/stripe                 ──▶ 订阅状态同步 → profiles
       │
       ├── Top-up 充值（lib/stripe-topup.ts）单次额度购买
       └── /api/subscription/status   订阅状态查询
```

| 功能 | 价值 |
|---|---|
| **分层用量** (`subscription-manager.ts`) | Free 3/月、Pro 100/月，缓存命中不计费 — 商业化与用户体验平衡 |
| **Top-up 充值** | 月配额用尽可单次购买 — 偶发高用量友好 |
| **Stripe Customer Portal** | 用户自助管理订阅、发票 — 零客服成本 |
| **Webhook 同步** | 订阅状态实时回写 Supabase — 权益变更立即生效 |
| **`UNLIMITED_VIDEO_USERS`** | 白名单邮箱跳过限额 — 团队/演示无障碍 |

---

## 十、翻译子系统

> **一句话**：把 transcript / chat / topic 三种来源按 `scenario` 走各自最优 prompt 路由到 `/api/translate`（LLM 或 Google API），通过 `translation-batcher.ts` 合并并发请求 + 客户端缓存避免重复调用——翻译质量贴合上下文、速度快、成本低，登录即可解锁。

```
                       ┌─────────────────────────┐
TranscriptViewer ──┬──▶│ /api/translate          │
ChatMessage      ──┤   │ · scenario 上下文路由   │
Topic            ──┤   │ · transcript/chat/topic │
                   │   │ · LLM 翻译 / Google API │
SelectionActions ──┘   └────────────┬────────────┘
                                    ▼
                          translation-batcher.ts
                          · 合并请求 / 客户端缓存
```

| 功能 | 价值 |
|---|---|
| **场景化翻译** | transcript / chat / topic 各自走最佳 prompt — 翻译质量贴合上下文 |
| **批处理与缓存** | 多段并发合并、避免重复调用 — 速度快、成本低 |
| **登录可用，免费/Pro 通用** | 仅需登录即可解锁，国际化用户友好 |

---

## 十一、邮件 + 营销

```
新用户注册 ──▶ /api/email/send-welcome ──▶ Postmark 模板 (welcome.ts)
月度活跃 ──▶ monthly-update.ts (模板)
退订   ──▶ /unsubscribe  + /api/newsletter/unsubscribe
```

| 功能 | 价值 |
|---|---|
| **欢迎邮件 / 月报** | 引导首次成功 + 召回沉默用户，用户激活与留存 |
| **GDPR 友好退订** | 一键退订页 + token 校验，合规、零摩擦 |

---

## 十二、安全与基础设施

> **一句话**：全站 `middleware.ts` 注入 CSP/HSTS 与 Supabase 会话刷新，每条 API 用 `withSecurity(handler, PUBLIC | AUTHENTICATED | STRICT)` 一行套上方法白名单 / CSRF 双 token / Body Size / 基于 SHA-256 IP 哈希的 Supabase 速率限制 / 审计日志 / DOMPurify 输入清洗——三档预设让路由按需选策略，默认安全、隐私合规、可追溯。

```
                  ┌──────── middleware.ts (全站) ────────┐
                  │  · CSP / HSTS 头                      │
                  │  · Supabase 会话刷新                  │
                  │  · 静态资源放行                       │
                  └────────────────┬───────────────────────┘
                                   ▼
              每条 API 路由套用 withSecurity(handler, preset)
                  ┌────────┬──────────────┬──────────┐
                  │ PUBLIC │ AUTHENTICATED│  STRICT  │
                  └───┬────┴──────┬───────┴────┬─────┘
                      │           │            │
                      ▼           ▼            ▼
                  ┌──────────────────────────────────┐
                  │ · 方法白名单                      │
                  │ · CSRF 令牌校验 (csrfFetch 配套)  │
                  │ · Body Size 限制                  │
                  │ · 速率限制 (Supabase rate_limits) │
                  │ · 审计日志 (audit-logger)         │
                  │ · 输入清理 (DOMPurify sanitizer)  │
                  └──────────────────────────────────┘
```

| 功能 | 价值 |
|---|---|
| **三档安全预设** | 路由按需选择策略，开发零负担 — 默认安全、降低误用 |
| **匿名 IP 哈希限流** | 不存原始 IP，仅 SHA-256 前 16 位 — 隐私合规 + 防刷 |
| **CSRF 双 token** (`lib/csrf-protection.ts`) | salt 签名 + cookie + header 校验 — 阻断 CSRF 攻击 |
| **审计日志** | 限流命中 / 越权访问入库 — 安全可追溯 |
| **输入消毒** | DOMPurify 处理用户输入 — XSS 防护 |

---

## 十三、性能与容错策略

> **一句话**：用三个互补机制把延迟和故障打散——并行处理（转写/元数据/主题/摘要分头跑，单点失败不阻塞全局）、后台任务 `backgroundOperation`（DB 写入与非关键流程不阻塞 UI、错误只记录）、`AbortManager` 统一管理请求生命周期（元数据 10s / 转写 30s / AI 60s 超时，卸载或重新分析时一并 abort），让首屏 1–2 秒内可见、抖动不卡死、切换主题立刻响应。

```
并行处理 (Promise.allSettled)
  ├── 转写 ∥ 元数据
  ├── 主题 ∥ 摘要
  └── 推荐问题（后台）

后台任务 (backgroundOperation)
  ├── 数据库写入不阻塞 UI
  └── 错误仅记录，不打断用户

请求生命周期 (AbortManager)
  ├── 元数据 10s 超时
  ├── 转写 30s
  └── AI 60s
卸载/重新分析时统一 abort，防止内存泄漏
```

| 价值 |
|---|
| 用户在 1–2 秒内即看到首屏内容；网络抖动不会"卡死"页面；切换主题时已有结果立即可见、新结果背景生成 |

---

## 十四、辅助工具集合

| 模块 | 作用 |
|---|---|
| `lib/access-control.ts` | 路由级权限校验 |
| `lib/audit-logger.ts` | 审计事件入库 |
| `lib/guest-usage.ts` | 匿名用户用量记录 |
| `lib/image-generation-manager.ts` | 图像生成额度与队列 |
| `lib/json-utils.ts` | LLM 返回 JSON 清洗 |
| `lib/promise-utils.ts` | AbortManager / safePromise / backgroundOperation |
| `lib/timestamp-normalization.ts` | 各种 LLM 时间戳格式归一 |
| `lib/webview-detector.ts` | 适配 In-App 浏览器（如 Twitter）OAuth 限制 |
| `lib/sanitizer.ts` | DOMPurify 包装，防 XSS |

---

## 总结：项目核心价值

```
┌──────────────────────────────────────────────────────────────────┐
│  把"被动看视频"变成"主动学知识"的端到端工作台                     │
├──────────────────────────────────────────────────────────────────┤
│  · 速度  : 并行 AI + 缓存 + 后台任务，秒级首屏                    │
│  · 深度  : 精华片段 + 摘要 + 引用问答 + 金句 + 翻译               │
│  · 留存  : 多源笔记 + 跨视频知识库                                │
│  · 信任  : 引文回锚原文，所有 AI 论断可追溯                       │
│  · 商业化: Free/Pro 分层 + Top-up + 翻译/导出付费墙               │
│  · 工程  : 多 Provider 解耦 + 全栈安全中间件 + 审计/限流          │
└──────────────────────────────────────────────────────────────────┘
```

LongCut 不是一个简单的 YouTube 摘要工具，而是把**视频转写、AI 内容生成、播放控制、笔记沉淀、订阅计费、安全合规**整合成一个完整 SaaS 产品的参考实现。
