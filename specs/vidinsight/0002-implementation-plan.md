# VidInsight 实施计划 — 0002 Implementation Plan

> 配套设计文档：`specs/vidinsight/0001-design.md`
> 颗粒度：**文件级任务 + 验收标准**，可被一个 IC 在 0.5–2 天内独立完成
> 排程：M0 → M8，强依赖串行，弱依赖标注 `[parallel-with]`
> 标记约定：`[ ]` 待办 · `[x]` 完成 · `(★)` 关键路径 · `(opt)` 可选

---

## 全局约定

- **代码风格**：TypeScript strict、ESLint 9 + `eslint-config-next`、import 顺序按 path alias 优先
- **命名**：文件 kebab-case；hook `useXxx`；React 组件 PascalCase；API 路由文件统一 `route.ts`
- **路径别名**：`@/*` → 项目根（`tsconfig.json`）
- **测试**：关键 lib 函数（quote-matcher / sentence-merger / format-detector / extractVideoId）必须有单元测试（`__tests__/*.test.ts`，`tsx --test`）
- **PR 大小**：每条 task ≤ 400 行 diff；超出拆分
- **每个 milestone 完成的标准**：本 milestone 全部 `[x]` + 验收清单 √ + 产出 demo gif/截图（贴回 `specs/vidinsight/notes/`）

---

## M0 项目脚手架与基建（约 1 天）

> **目标**：跑得起来 `npm run dev`，出 hello-world 页面，含 Supabase + 安全头骨架。
> **依赖**：无。

### M0.1 工程初始化 (★)

- [ ] `package.json` — 复制 `vendors/longcut/package.json`，**移除** `@stripe/*`, `stripe`, `postmark`, `@google/generative-ai`, `@google-cloud/translate`，**保留** `@vercel/analytics`，保留其余
- [ ] `tsconfig.json` — strict、`@/*` 别名、`moduleResolution: bundler`
- [ ] `next.config.ts` — Turbopack、`images.remotePatterns`（`i.ytimg.com`, `*.googleusercontent.com`）
- [ ] `eslint.config.mjs` — 复用 longcut 配置
- [ ] `postcss.config.mjs` + `app/globals.css` — Tailwind 4 + tw-animate-css
- [ ] `components.json` — shadcn/ui 配置
- [ ] `.gitignore`、`.env.local.example`

**验收**：`npm install && npm run dev` 启动 3000 端口；`/` 返回空白页面 200。

### M0.2 环境变量校验

- [ ] `scripts/validate-env.ts` — 必填：`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MINIMAX_API_KEY`, `SUPADATA_API_KEY`；缺失退出码 1。`VERCEL_*` 类变量不校验（Vercel 平台自动注入）
- [ ] 在 `package.json` 添加 `"validate-env": "tsx scripts/validate-env.ts"` 与 `"prebuild": "npm run validate-env"`
- [ ] `.env.local.example` 列出所有应用变量；注释说明 `NEXT_PUBLIC_APP_URL` 在 Vercel preview 环境下应留空（让 `resolveAppUrl()` 走 `VERCEL_URL`）

**验收**：`MINIMAX_API_KEY=""` 时 `npm run validate-env` 退出码 1 且 stderr 列出缺失 keys；脚本不报 `VERCEL_*` 变量缺失。

### M0.3 基础类型与工具

- [ ] `lib/types.ts` — 拷贝 longcut，去掉 Stripe / Subscription 相关；保留 `TranscriptSegment`, `Topic`, `TopicCandidate`, `VideoInfo`, `Citation`, `ChatMessage`, `Note`, `NoteWithVideo`, `NoteSource`, `NoteMetadata`, `PlaybackCommand`
- [ ] `lib/utils.ts` — `extractVideoId(url)`, `formatDuration(s)`, `formatTopicDuration(s)`, `cn()` (tailwind-merge), `getTopicColor(idx)`, `getTopicHSLColor(idx)`
- [ ] `lib/__tests__/utils.test.ts` — `extractVideoId` 覆盖 `youtu.be`, `watch?v=`, `shorts/`, `embed/`, 带 query string，invalid URL → null

**验收**：`tsx --test lib/__tests__/utils.test.ts` 全绿，至少 8 个 case。

### M0.4 Supabase 客户端三件套

- [ ] `lib/supabase/client.ts` — `createBrowserClient()`
- [ ] `lib/supabase/server.ts` — `createServerClient()`，cookie-based
- [ ] `lib/supabase/middleware.ts` — 在 Edge middleware 中刷新 session
- [ ] `lib/supabase/admin.ts` — Service Role client（仅服务端，guard `typeof window === 'undefined'`）
- [ ] `lib/supabase/types.ts` — 占位（M1 之后由 `supabase gen types` 生成）

**验收**：能 import 不报错；`supabase.auth.getUser()` 在空 session 下返回 `{ data: { user: null } }`。

### M0.5 全局 middleware.ts（仅安全头骨架，不写 CSRF）

- [ ] `middleware.ts` — Supabase session refresh + 安全头（CSP / HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy）
- [ ] `lib/csp.ts` — `buildCSP()` 工厂；白名单：`youtube.com`, `youtu.be`, `i.ytimg.com`, `*.supabase.co`, `api.minimax.chat`, `api.supadata.ai`

**验收**：`curl -I http://localhost:3000` 看到 6 条安全头；CSP 含上述域名。

### M0.6 根布局与 Provider 包裹

- [ ] `app/layout.tsx` — 拷贝 longcut；保留 `AuthProvider` 占位、`ToastProvider` (`sonner`)、Geist 字体；引入 `<Analytics />` from `@vercel/analytics/react` 挂载在 `<body>` 末尾
- [ ] `contexts/auth-context.tsx` — 占位实现：`{ user: null, loading: false, signOut: noop }`（M6 完整实现）
- [ ] `components/toast-provider.tsx` — `<Toaster />` 配置
- [ ] `lib/utils.ts` 新增 `resolveAppUrl(fallbackOrigin?)` — 复刻 `vendors/longcut/lib/utils.ts:128`，按 `VERCEL_ENV` / `VERCEL_URL` / `NEXT_PUBLIC_APP_URL` 优先级返回 origin

**验收**：根布局 Hydration 无 console error；本地 `<Analytics />` 自动 noop（无 401 上报错误）；`resolveAppUrl()` 单测覆盖 production / preview / local 三种 env 组合。

---

## M1 视频摄取与缓存（约 2 天，对应设计 §3）

> **目标**：贴 URL → 命中缓存秒开 / 未命中拿到 transcript + video-info。
> **依赖**：M0。

### M1.1 数据库初始迁移 (★)

- [ ] `supabase/migrations/20260101000000_init_core.sql`
  - `profiles` 表（精简版，见设计 §14.1）
  - `video_analyses` 表 + `youtube_id` 唯一索引
  - `user_videos` 表
  - 关闭部分 RLS（M8 再开），先用 service role 写

**验收**：`supabase db push` 成功；可以用 SQL Editor 写一行 `video_analyses` 测试数据。

### M1.2 oEmbed 视频元数据 (★)

- [ ] `lib/video-info-provider.ts` — `fetchVideoInfo(videoId, signal)`：调用 `https://www.youtube.com/oembed?url=...&format=json`，10s 超时；失败 fallback 用 `i.ytimg.com/vi/{id}/maxresdefault.jpg`
- [ ] `app/api/video-info/route.ts` — `GET /api/video-info?videoId=...`，输出 `VideoInfoResponse`
- [ ] 单元测试 `lib/__tests__/video-info-provider.test.ts`（mock fetch）

**验收**：`curl '/api/video-info?videoId=dQw4w9WgXcQ'` 返回 `{title, author, thumbnail}`。

### M1.3 InnerTube 转写抓取 (★)

- [ ] `lib/youtube-transcript-provider.ts`
  - 三身份配置：ANDROID / WEB / IOS（`clientName`, `clientVersion`, `userAgent`, `apiKey`）
  - 步骤：scrape watch page → 提取 `INNERTUBE_API_KEY`、`INNERTUBE_CLIENT_VERSION`、caption tracks → POST `/youtubei/v1/player` → 解 timed text
  - 处理 EU consent redirect（cookie `CONSENT=YES+`）
  - 抛出 `TranscriptError`：`TRANSCRIPT_BLOCKED` / `TRANSCRIPT_NOT_FOUND` / `TRANSCRIPT_DISABLED`

**验收**：本地真实 YouTube 视频（如 TED 演讲）能拿到 ≥10 段 transcript；私密视频抛 `TRANSCRIPT_NOT_FOUND`。

### M1.4 Supadata 兜底 (★)

- [ ] `lib/supadata-transcript-provider.ts` — `fetchSupadataTranscript(videoId, signal)`，调用 `https://api.supadata.ai/v1/youtube/transcript`，header `x-api-key`
- [ ] 字段映射：`{text, offset(ms), duration(ms)}` → `TranscriptSegment{text, start(s), duration(s)}`

**验收**：故意把 InnerTube 全失败（mock），fallback 自动接管，输出格式与 InnerTube 完全一致。

### M1.5 格式检测 + 句子合并

- [ ] `lib/transcript-format-detector.ts` — `detectTranscriptFormat(segments)` → `'old' | 'new'`；阈值：句末标点占比 <15% 老 / >80% 新；平均长度 >40 chars 倾向新
- [ ] `lib/transcript-sentence-merger.ts` — `mergeSegmentsIntoSentences(segments, opts?)`；约束 `MAX_DURATION=24s` / `MAX_WORDS=80` / `MAX_SEGMENTS=20`
- [ ] `lib/__tests__/transcript-format-detector.test.ts` + `lib/__tests__/transcript-sentence-merger.test.ts`

**验收**：单测覆盖 4 种 case：纯老格式、纯新格式、临界、空输入。

### M1.6 /api/transcript 编排

- [ ] `app/api/transcript/route.ts`
  - 入参：`{videoId}`
  - 编排：InnerTube ANDROID → WEB → IOS → Supadata
  - 末段调用 `ensureMergedFormat()`（detector + merger）
  - 30s 总超时

**验收**：手动测试 4 种视频（公开/私密/无字幕/老短碎），符合预期降级路径。

### M1.7 缓存命中检查

- [ ] `app/api/check-video-cache/route.ts` — `GET ?youtubeId=` lookup `video_analyses`，仅 select `{id, youtube_id, title, author, thumbnail_url, duration, updated_at}`，避免拉 jsonb
- [ ] `app/api/video-analysis/route.ts` — `GET ?youtubeId=` 拉完整记录（含 transcript / topics / summary）

**验收**：种 1 条数据，前者 <50ms 返回轻量；后者返回完整。

---

## M2 AI 适配层 + 五件套（约 2.5 天，对应设计 §4–§5）

> **目标**：transcript → 5 个并行流水线 → 结构化输出回前端。
> **依赖**：M1（拿到 transcript）。
> **注**：首版仅 MiniMax 一个 Provider，无 cross-provider fallback；适配层接口预留扩展。

### M2.1 Provider 适配层骨架 (★)

- [ ] `lib/ai-providers/types.ts` — `ProviderAdapter`, `ProviderGenerateParams<T>`, `ProviderGenerateResult<T>`, `RetryableError`, `ProviderError`
- [ ] `lib/ai-providers/provider-config.ts` — `resolveProviderKey()` 仅返回 `'minimax'`；`BEHAVIOR.minimax = { retryable, maxRetries: 2, backoffMs: [500, 2000], ... }`；遇到未知 `AI_PROVIDER` 抛 `ConfigError`
- [ ] `lib/ai-providers/registry.ts` — `getProvider('minimax')` 单例缓存（switch 仅 1 case，TODO 注释标记未来扩展点）
- [ ] `lib/ai-providers/index.ts` — re-export

**验收**：单测 `provider-config.test.ts`：`AI_PROVIDER=minimax` / 未设置 → `'minimax'`；`AI_PROVIDER=grok` → throw。

### M2.2 MiniMax 适配器 (★)

- [ ] `lib/ai-providers/minimax-adapter.ts`
  - Endpoint：MiniMax Chat Completions
  - 支持 `temperature`, `top_p`, `max_tokens`, structured output（`response_format: { type: 'json_schema', json_schema: { schema: ... } }`）
  - 超时 `AbortController`
  - 错误归类：`429/500/502/503/504` → retryable
  - 内部指数退避重试 ≤2 次（`backoffMs: [500, 2000]`），仍失败抛 `ProviderError`

**验收**：本地真实 key 调一次 `generate({prompt:'hi', model:'MiniMax-M2.7'})`，返回非空文本；mock 503 验证两次重试时间间隔正确。

### M2.3 统一 AI Client (★)

- [ ] `lib/ai-client.ts`
  - `generateAIResponse(prompt, opts)` → `string`
  - `generateStructuredContent<T>(prompt, schema, opts)` → `T`（含 `safeParse` 失败时回退 prompt 简化版重试一次）
  - `generateAIResult(...)` → `ProviderGenerateResult`
  - 直接调 `getProvider('minimax').generate(...)`，**不实现** cross-provider fallback
- [ ] `lib/ai-providers/__tests__/minimax-retry.test.ts` — mock 503 两次后 200，断言最终成功；mock 503 三次断言抛 `ProviderError`

**验收**：`AI_PROVIDER=minimax` + 错 key → 抛 `ProviderError` 含 401 状态；正确 key → 正常返回。

### M2.4 Prompts 模板

- [ ] `lib/prompts/topics.ts` — `buildTopicsPrompt({transcript, videoInfo, language, excludeTopicKeys?, includeCandidatePool})`
- [ ] `lib/prompts/summary.ts`
- [ ] `lib/prompts/quotes.ts`
- [ ] `lib/prompts/questions.ts`
- [ ] `lib/prompts/chat.ts`（M4 用，但定义在这里）
- [ ] `lib/prompts/quick-preview.ts`
- [ ] 每个 prompt 内嵌 "OUTPUT JSON SCHEMA" 段，便于 LLM 结构化

**验收**：所有 prompt 函数纯函数、无副作用、可直接对比快照。

### M2.5 Zod Schemas

- [ ] `lib/schemas.ts` — `topicsSchema`, `topicCandidatesSchema`, `summaryTakeawaysSchema`, `topQuotesSchema`, `suggestedQuestionsSchema`, `chatResponseSchema`, `quickPreviewSchema`
- [ ] 每个 schema 配 `safeParse` 失败 fallback handler

### M2.6 五个 API 路由 (★)

- [ ] `app/api/generate-topics/route.ts` — POST，强制 `mode='smart'`；输出 `{topics, topicCandidates}`
- [ ] `app/api/generate-summary/route.ts`
- [ ] `app/api/quick-preview/route.ts`
- [ ] `app/api/top-quotes/route.ts`
- [ ] `app/api/suggested-questions/route.ts`
- 每个路由先用 **裸 export**（不套 withSecurity，M8 统一改造），但务必保留 60s 超时；Topics 路由在 `vercel.json` 配 `maxDuration: 90`

**验收**：5 个 endpoint 用同一段示例 transcript 调用，全部返回结构化 JSON 且通过 schema 校验。

### M2.7 Promise Utils

- [ ] `lib/promise-utils.ts`
  - `class AbortManager` — `createController(key, timeoutMs?)`, `getSignal(key)`, `cleanup(key?)`
  - `safePromise<T>(p)` → `[T|null, Error|null]`
  - `backgroundOperation(name, op, onError?)`
  - `withTimeout(p, ms, signal?)`
- [ ] 单测覆盖 abort、timeout、cleanup-all

**验收**：mount/unmount React 组件触发 cleanup 时无 unhandled rejection。

---

## M3 双栏分析工作台（约 4 天，对应设计 §6）

> **目标**：UI 跑通；用户能看到 player + topics + transcript + summary 同屏。
> **依赖**：M1 (transcript)、M2 (五件套 API)。

### M3.1 Landing 页

- [ ] `app/page.tsx` — `<UrlInputWithBranding />`，提交 → router.push(`/analyze/[videoId]`)
- [ ] `components/url-input.tsx` + `components/url-input-with-branding.tsx`
- [ ] 处理 `?auth=limit` query（M6 用）

### M3.2 分析页状态机 (★)

- [ ] `app/analyze/[videoId]/page.tsx`
  - states：`IDLE | ANALYZING_NEW | LOADING_CACHED`
  - stages：`fetching | understanding | generating | processing`
  - 流程：mount → check-video-cache → 命中 LOADING_CACHED 直接渲染 / 未命中 ANALYZING_NEW + 触发并行 fetch chain（见设计 §5.2）
  - 卸载时 `abortMgr.cleanup()`

### M3.3 PlaybackCommand bus + YouTubePlayer (★)

- [ ] `components/youtube-player.tsx` — IFrame Player API 封装
  - props: `{videoId, command: PlaybackCommand, onTimeUpdate}`
  - 处理 `SEEK / PLAY / PAUSE / PLAY_SEGMENT (auto-pause at end) / PLAY_TOPIC (chained segments) / PLAY_ALL / PLAY_CITATIONS`
- [ ] `contexts/play-all-context.tsx` — 链式播放队列状态 `{queue, currentIdx, isActive}`

**验收**：手动点击 topic card → player seek + 自动播 → 段末自动 pause。

### M3.4 时间轴着色

- [ ] `components/video-progress-bar.tsx` — 拿 `topics[].segments[]` + `getTopicHSLColor()` 染色；hover tooltip 显示 topic title；点击 → SEEK
- [ ] `components/video-skeleton.tsx` — loading 占位

### M3.5 HighlightsPanel + TopicCard

- [ ] `components/highlights-panel.tsx` — 容器；显示 baseTopics；包含 `<ThemeSelector />`
- [ ] `components/topic-card.tsx` — 卡片：title / duration / quote / 颜色条；点击 → dispatch PLAY_TOPIC
- [ ] `components/theme-selector.tsx` — 从 topicCandidates 提取 themes（关键词聚类，简版即可）
- [ ] `lib/topic-utils.ts` — `extractThemes(candidates)`, `findCandidatesForTheme(theme, candidates)`

**验收**：5 张 base topic 卡 + 3-5 个 theme 选项；点 theme 触发 `/api/generate-topics` 加 `excludeTopicKeys` 二次生成。

### M3.6 RightColumnTabs

- [ ] `components/right-column-tabs.tsx` — Radix Tabs：Summary / Chat / Transcript / Notes（前两 tab 此 milestone 渲染占位 / 后两 M4-M5 完整）
- [ ] `components/summary-viewer.tsx` — `react-markdown + remark-gfm`，时间戳点击 → SEEK
- [ ] `components/transcript-viewer.tsx` — 当前播放 segment 高亮 + auto scroll；选段触发 `<SelectionActions />`（M5 实现）

### M3.7 视频头与加载提示

- [ ] `components/video-header.tsx` — title / author / favorite / share / language selector
- [ ] `components/loading-tips.tsx` + `components/loading-context.tsx` — 多阶段进度文案

**验收**：贴一个真实 YouTube 链接，60 秒内看到完整 5 topics + summary + transcript；切 theme 看到加载态；卸载后无 console error。

---

## M4 引文与 AI Chat（约 2 天，对应设计 §7–§8）

> **目标**：Chat 答案带 [n] 引用，可一键串播。
> **依赖**：M2、M3。

### M4.1 Quote Matcher (★)

- [ ] `lib/quote-matcher.ts`
  - `buildTranscriptIndex(segments)` — 构建 `fullTextSpace`, `normalizedText`, `segmentBoundaries`, `wordIndex`, `ngramIndex`
  - `matchQuote(index, query, opts?)` — Boyer-Moore exact → normalized → 3-gram Jaccard fuzzy（阈值 0.85）
  - 返回 `MatchResult`
- [ ] `lib/__tests__/quote-matcher.test.ts` — 至少 12 case：完全相同 / 大小写 / 标点不同 / 改写 / 不存在 / 多次出现取首次
- [ ] `lib/timestamp-utils.ts` + `lib/timestamp-normalization.ts` — `parseTimestamp('1:23')`, `formatTimestamp(78)`

**验收**：测试覆盖率 ≥ 90%；fuzzy 匹配在 LLM 改写引文上准确率 ≥ 85%。

### M4.2 Chat API

- [ ] `app/api/chat/route.ts`
  - 入参：`{transcript, topics?, message, conversationHistory?, videoInfo?, targetLanguage?}`
  - 调用 `generateStructuredContent(buildChatPrompt(...), chatResponseSchema)`
  - **后处理**：每条 citation 跑 `matchQuote` → 补 `start/end/segmentIdx/charOffset`
  - 输出 `ChatResponse{ answer, citations: Citation[] }`

**验收**：问 "What does the speaker say about X?"，答案含 [1][2]，每条 citation 的 `start` 时间戳在 transcript 范围内。

### M4.3 Chat UI

- [ ] `components/ai-chat.tsx` — 对话主面板；conversationHistory 状态；发送时 abort 旧请求
- [ ] `components/chat-message.tsx` — markdown 渲染 + `[1]` 上标可点 → `dispatch(SEEK)`；底部 "Play Citations" 按钮 → `dispatch(PLAY_CITATIONS)`
- [ ] `components/suggested-questions.tsx` — 显示 `/api/suggested-questions` 结果；点击 fill input

**验收**：手动对话 3 轮，引文上标可点击跳秒；Play Citations 把 3 条引文串播完毕。

---

## M5 笔记系统（约 2 天，对应设计 §9）

> **目标**：四来源创建 + 单视频面板 + 全局 `/all-notes` 检索。
> **依赖**：M3、M4（chat / takeaways 来源）。

### M5.1 数据库 + 类型

- [ ] `supabase/migrations/20260102000000_user_notes.sql` — `user_notes` 表 + 索引
- [ ] `lib/types.ts` 已含 `Note / NoteSource / NoteMetadata`（M0.3 已完成）

### M5.2 API 路由

- [ ] `app/api/notes/route.ts` — `GET ?youtubeId=` / `POST` / `DELETE ?id=`
- [ ] `app/api/notes/all/route.ts` — `GET`（join `video_analyses` 拉视频信息）
- [ ] 入参 zod 校验（`text` ≤ 16KB）

### M5.3 客户端

- [ ] `lib/notes-client.ts` — `fetchNotes / saveNote / deleteNote / fetchAllNotes / enhanceNoteQuote`，全用 `csrfFetch`（M8 实装；M5 临时用裸 fetch + TODO 注释）

### M5.4 UI

- [ ] `components/notes-panel.tsx` — 单视频笔记列表 + 自由输入；按 source 分组 / 倒序
- [ ] `components/note-editor.tsx` — inline 编辑（保留 metadata 上下文）
- [ ] `components/selection-actions.tsx` — transcript 选段右键菜单（Save as note / Translate / Seek）
- [ ] `app/all-notes/page.tsx` — 跨视频列表 + 筛选（source / video / 时间） + 全文搜索（≤24 字符客户端，>24 服务端 ILIKE）

**验收**：四来源各创建一条；刷新仍在；删除生效；`/all-notes` 跨视频聚合 + 搜索正确。

---

## M6 用户体系（约 2 天，对应设计 §10）

> **目标**：登录 / 匿名分析回填 / 个人空间路由全通。
> **依赖**：M0（Supabase 客户端）、M1（video_analyses 已建）、M5（笔记需 user）。

### M6.1 Auth 完整 Provider

- [ ] `contexts/auth-context.tsx` — 真实实现：getSession + onAuthStateChange + 标签可见性恢复刷新（>30s 隐藏 → 刷新 + 清 csrf token cache）
- [ ] `app/auth/callback/route.ts` — OAuth 回调 exchange code

### M6.2 Auth UI

- [ ] `components/auth-modal.tsx` — Supabase Auth UI（email magic link + Google OAuth）
- [ ] `components/user-menu.tsx` — 头像下拉（My videos / All notes / Settings / Sign out）

### M6.3 链接匿名视频 (★)

- [ ] `app/api/link-video/route.ts` — POST `{videoId}`：校验 video_analyses 存在 → upsert profile → upsert user_videos
- [ ] `app/api/verify-video-link/route.ts` — 用于前端轮询确认
- [ ] AuthProvider 内：`onAuthStateChange(SIGNED_IN)` → 读 `sessionStorage.pendingVideoId` → 指数退避重试 link-video

**验收**：匿名分析视频 → 触发 auth modal → 登录后视频自动出现在 `/my-videos`。

### M6.4 速率限制接口（仅雏形，M8 完整）

- [ ] `app/api/check-limit/route.ts` — 简版：返回 `{remaining, limit}`，依赖 `lib/rate-limiter.ts`（M8 完整）

### M6.5 个人空间页

- [ ] `app/my-videos/page.tsx` — 历史 + 收藏 tabs；`<UsageIndicator />`
- [ ] `app/settings/page.tsx` — 默认翻译目标语言 / 显示密度（mode 选择已隐藏，因为只有 smart）
- [ ] `app/v/[slug]/page.tsx` — SEO 静态/缓存渲染：直接读 `video_analyses` 渲染只读视图（无 chat/notes）；含 `generateMetadata`

### M6.6 偏好 Hook

- [ ] `lib/hooks/use-mode-preference.ts` — 仅返回 `'smart'`（保留 setMode no-op 以维持 API 兼容）
- [ ] `lib/hooks/use-translation-preference.ts` — 双写 profiles + localStorage

### M6.7 收藏

- [ ] `app/api/toggle-favorite/route.ts` — POST `{videoId}` → upsert `user_videos.is_favorite`

**验收**：完整登录注销流程；`/v/[slug]` 静态分享页可被未登录用户访问。

---

## M7 翻译子系统（约 1.5 天，对应设计 §11）

> **目标**：transcript / chat / topic 三场景翻译可用，登录限定。
> **依赖**：M2 (AI client)、M6 (auth)。

### M7.1 Translation 库

- [ ] `lib/translation/types.ts` — `TranslationScenario`, `TranslationContext`, `TranslationRequest`, `TranslationResponse`
- [ ] `lib/translation/llm-translate-client.ts` — `translate(items, target, scenario, context?)`：调 `generateAIResponse`；temperature 0.3；分隔符 `<<<TRANSLATION>>>`；>35 条切块
- [ ] `lib/translation/index.ts` — 公开 `translate()`, `translateBatch()`
- [ ] `lib/translation/client.ts` — 浏览器侧 thin wrapper

### M7.2 Batcher

- [ ] `lib/translation-batcher.ts`
  - 队列 `{text, scenario, target, resolve, reject}`
  - 触发 flush：`batchDelay=50ms` 或 `maxBatchSize=35`
  - in-memory cache（key=hash(text+scenario+target)）
  - 重试 ≤3 次指数退避

**验收**：50ms 内同时调 10 次 translate 同一 target → 仅 1 次网络请求。

### M7.3 API 路由

- [ ] `app/api/translate/route.ts` — POST `{texts, scenario, target, context?}`，要求登录
- [ ] 三 scenario prompts 内嵌于 `lib/translation/llm-translate-client.ts`

### M7.4 Hook & UI 接入

- [ ] `lib/hooks/use-translation.ts` — 单文本翻译 hook（带 cache）
- [ ] `components/language-selector.tsx` — 顶部语言选择
- [ ] TranscriptViewer / ChatMessage / TopicCard 接入 `translatedText` 渲染分支

**验收**：transcript 切到 zh-CN，所有段位回中文；chat 答案保持 [n] 编号不变。

---

## M8 安全栈与上线收尾（约 2 天，对应设计 §12–§14）

> **目标**：所有 API 套上 `withSecurity`、CSRF 双 token 全链路、RLS 全开、审计 + 速率限制工作。
> **依赖**：所有前序 milestone。

### M8.1 速率限制 (★)

- [ ] `supabase/migrations/20260103000000_rate_limits.sql` — `rate_limits` 表 + 索引
- [ ] `lib/rate-limiter.ts` — `RateLimiter.check({key, identifier, windowMs, max})`；`identifier = userId ?? sha256(ip).slice(0,16)`；窗口 count 查询
- [ ] cron 清理 7 天前数据（Supabase scheduled function）

**验收**：单测：连续 11 次 STRICT preset 调用，第 11 次 429。

### M8.2 CSRF 双 Token

- [ ] `app/api/csrf-token/route.ts` — `GET` 生成 32 字节 hex；写 cookie `csrf-token`（HttpOnly=false 让 client 读，或单独再写一个非 HttpOnly mirror cookie；按 longcut 实现走）
- [ ] `lib/csrf-protection.ts` — `validateCsrf(req)`：从 cookie & header 读取，等值校验
- [ ] `lib/csrf-client.ts` — `csrfFetch(input, init)`：自动注入 header `X-CSRF-Token`

**验收**：用 Postman 删 header 调 POST `/api/notes` → 403；带 header → 200。

### M8.3 安全中间件 (★)

- [ ] `lib/security-middleware.ts`
  - `SECURITY_PRESETS`: `PUBLIC | AUTHENTICATED | AUTHENTICATED_READ_ONLY | STRICT`
  - `withSecurity(preset, handler)` — 链式：method whitelist → auth → rate limit → body size → CSRF → DOMPurify → handler → audit log → security headers
- [ ] 所有 `app/api/**/route.ts` 改为 `export const POST = withSecurity(STRICT, handler)` 风格

**验收**：随机抽 5 个端点，curl 不带 CSRF/超 body/超 rate → 全部 4xx + 详细日志。

### M8.4 输入清洗 + 审计

- [ ] `lib/sanitizer.ts` — server: `dompurify + jsdom`；`sanitizeRequestBody(obj)` 递归 string；`sanitizeMarkdown(md)`
- [ ] `lib/audit-logger.ts` — `logAuditEvent({user, action, resourceType, resourceId, details, request})`；写 `audit_logs` 表
- [ ] `supabase/migrations/20260104000000_audit_logs.sql`

### M8.5 RLS 全开

- [ ] `supabase/migrations/20260105000000_enable_rls.sql`
  - profiles / user_videos / user_notes：`auth.uid() = id|user_id`
  - video_analyses：select 全开（`/v/[slug]` 需要），insert/update 由 service role 走应用层鉴权
  - rate_limits / audit_logs：仅 service role 可写

**验收**：用 anon key 直接 `select * from user_notes where user_id != auth.uid()` 返回 0 行。

### M8.6 Vercel 部署 (★)

- [ ] `vercel.json` — `framework: nextjs` / `regions: ['iad1']` / 各 AI 路由 `maxDuration` 配置（generate-topics: 90s，chat / generate-summary / top-quotes / quick-preview / suggested-questions: 60s，translate / transcript: 30s）/ Cron `0 3 * * *` 调 `/api/cron/cleanup-rate-limits`
- [ ] `app/api/cron/cleanup-rate-limits/route.ts` — 删除 7 天前 `rate_limits` 行；Vercel Cron 调用时校验 `Authorization: Bearer ${CRON_SECRET}` header
- [ ] Vercel 项目设置：
  - 绑定 GitHub 仓库（main → production，所有 PR → preview）
  - Environment Variables：production / preview / development 三套，复制 `.env.local.example` 全部应用变量；preview 不设 `NEXT_PUBLIC_APP_URL`
  - 启用 Web Analytics（`@vercel/analytics` 已在 layout 挂载）
- [ ] Supabase Auth → URL Configuration：
  - Site URL = production 域
  - Redirect URLs 增加 `https://*.vercel.app/auth/callback` 通配符（preview 部署用）

**验收**：production 部署成功；preview 部署 OAuth 登录可走通；Vercel Cron 在控制台显示绿色已触发；Web Analytics dashboard 能看到访问数据。

### M8.7 文档与法律页

- [ ] `app/sitemap.ts` + `app/robots.ts` — 仅 public 路由
- [ ] `app/privacy/page.tsx` + `app/terms/page.tsx` — 拷贝 longcut 模板，删邮件营销条款
- [ ] `components/footer.tsx`
- [ ] `README.md` — quickstart + env 说明 + 一键部署到 Vercel 按钮（`https://vercel.com/new/clone?repository-url=...`）

**验收**：`npm run build` 0 warning；Lighthouse 主页 ≥ 90 分；移动端可访问。

---

## 跨 milestone 的并行机会

| 可并行任务 | 前置 | 备注 |
|---|---|---|
| M1 + M2 部分 | M0 完成 | M2 的 prompts/schemas 不依赖 transcript 实拉 |
| M3 + M4 引文 | M2 完成 | M4 quote-matcher 是纯函数，可在 M3 进行时同步开发 |
| M5 + M6 | M3 完成 | 笔记 UI 与认证 UI 弱依赖 |
| M7 | M2 + M6 | 与 M5 完全独立 |
| 单元测试 | 各 milestone 内同步写 | 不堆到最后 |

---

## 不在本计划范围（推迟到 0003+）

- 图像生成（`/api/generate-image`）
- transcript 导出 PDF/Markdown（longcut 有 `transcript-export.ts` + `transcript-export-dialog.tsx`，先不做）
- A/B 实验、分析埋点
- 多语种 SEO（仅 en + zh-CN）
- PWA / 离线模式
- 移动端原生 app

---

## 风险与缓解

| 风险 | 触发概率 | 缓解 |
|---|---|---|
| YouTube InnerTube 三身份全失效 | 中 | Supadata 兜底已设计；M1.4 必做 |
| MiniMax structured output 不稳定 | 中 | M2.2 内部 ≤2 次重试 + schema safeParse 失败时用简化 prompt 重试一次；持续失败由 `Promise.allSettled` 隔离单点 |
| MiniMax 单点故障无 Provider fallback | 中 | 通过 SLA 监控 + 内部重试覆盖；架构接口预留扩展，必要时 1–2 天可加 Grok 适配器 |
| Quote-matcher 模糊匹配误命中 | 低 | confidence < 1 时 UI 加视觉提示；阈值 0.85 偏严格 |
| Supabase RLS 配错导致数据互通 | 中 | M8.5 完成后必做 pen test：用 user A 的 anon token 试图读 user B 数据 |
| Vercel 函数 60s 超时长视频不够 | 低 | `vercel.json` 把 `/api/generate-topics` 设 `maxDuration: 90` |
| Rate limit 表无限增长 | 中 | M8.1 + Vercel Cron 每日清理 |
| Preview 部署 OAuth redirect 域不匹配 | 中 | Supabase Auth 配通配 `*.vercel.app`；`resolveAppUrl()` 优先用 `VERCEL_URL` |

---

## 完成定义（DoD）

每条 task 同时满足：

1. ✅ 代码合入 main 且 CI 绿
2. ✅ 涉及 lib/ 公共函数 → 单测覆盖
3. ✅ 涉及 API → 至少一个 happy path 集成测试或手动 curl 截图
4. ✅ 涉及 UI → 截图 / gif 贴 PR 描述
5. ✅ 关联 design doc 章节号写入 PR 描述

---

> **状态**：v0.1 实施计划，待评审后切 M0 第一条 PR。
