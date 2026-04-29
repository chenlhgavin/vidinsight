# VidInsight 设计方案 — 0001 Initial Design

> 参考实现：`vendors/longcut`
> 范围调整（相对 longcut）：
> - **移除**：邮件 + 营销（Postmark / newsletter / unsubscribe / welcome email）、计费与订阅（Stripe / topup credits / subscription tier）、Grok / Gemini 适配器（只保留 MiniMax）、图像生成
> - **保留 / 强化**：MiniMax（**唯一** AI Provider）、Supadata（付费转写兜底）、Supabase（Auth + DB）、Vercel（部署 + Analytics + Preview URL）、CSP/CSRF/速率限制安全栈
> - **架构原则**：与 longcut 技术栈一致（Next.js 15 App Router + React 19 + Tailwind 4 + Radix UI + Supabase SSR + Zod），降低迁移成本；Provider 适配层接口保留以便未来扩展，但首版只交付 MiniMax 一个具体实现

---

## 0. 总览

VidInsight 把任意 YouTube 链接，在 60 秒内变成一个"可消费、可检索、可沉淀"的学习工作台。它由七层组成：

```
┌──────────────────────────────────────────────────────────────────┐
│  UI 层    Next.js App Router · 双栏分析台 · /v 分享页 · /all-notes │
├──────────────────────────────────────────────────────────────────┤
│  路由层   /api/* · withSecurity 包装 · CSRF · Rate Limit · Audit  │
├──────────────────────────────────────────────────────────────────┤
│  能力层   摄取 · AI 五件套 · 引文回锚 · 翻译 · 笔记 · 播放命令       │
├──────────────────────────────────────────────────────────────────┤
│  适配层   AI Provider Registry（仅 MiniMax，接口预留扩展）          │
├──────────────────────────────────────────────────────────────────┤
│  数据层   Supabase Postgres · video_analyses / user_videos / notes │
├──────────────────────────────────────────────────────────────────┤
│  外部源   YouTube InnerTube · YouTube oEmbed · Supadata · MiniMax  │
├──────────────────────────────────────────────────────────────────┤
│  基建     AbortManager · backgroundOperation · safePromise · CSP  │
├──────────────────────────────────────────────────────────────────┤
│  部署     Vercel（Edge Runtime · Analytics · Preview · Cron）      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. 技术栈（与 longcut 对齐）

| 类别 | 选型 | 备注 |
|---|---|---|
| 框架 | Next.js `15.5.7` (App Router, Turbopack) | `next dev --turbopack` / `next build --turbopack` |
| 运行时 | React `19.1.2` + React DOM `19.1.2` | Server Components 优先 |
| 样式 | Tailwind CSS `4` + `tw-animate-css` + `tailwind-merge` + `class-variance-authority` | `cn()` 合并工具同 longcut |
| 组件库 | Radix UI 全家桶（Dialog / Tabs / Tooltip / Select / DropdownMenu / Slider 等） | shadcn/ui 模式 |
| 图标 | `lucide-react` | |
| Toast | `sonner` | `ToastProvider` 包根布局 |
| 表单/校验 | `zod 4.1.x` | AI 结构化输出 + API 入参 |
| Auth + DB | `@supabase/ssr` + `@supabase/supabase-js` | SSR cookie 模式 |
| AI Provider | **MiniMax**（`MiniMax-M2.7`） | 唯一 Provider；通过适配层调用 |
| 转写兜底 | **Supadata** | InnerTube 三身份失败时调用 |
| 安全 | `dompurify` + `jsdom`（服务端 DOMPurify）、自研 `withSecurity()` | CSP / HSTS / 双 token CSRF |
| 部署 / 监控 | **Vercel** + `@vercel/analytics` | Edge runtime / Preview URL / Speed Insights |
| 测试 / 脚手架 | `tsx` 运行器 + ESLint 9 + `eslint-config-next` | |

**移除**（相对 longcut 的 `package.json`）：
- `@stripe/stripe-js`、`stripe` — 订阅/计费
- `postmark` — 营销邮件
- `@google/generative-ai` — 不做图像生成、不集成 Gemini
- `@google-cloud/translate` — 翻译只走 LLM 路径，不维护 Google API key

**保留**：`@vercel/analytics`（部署到 Vercel 时启用 Web Analytics）。

---

## 2. 项目目录（顶层骨架）

```
vidinsight/
├── app/
│   ├── layout.tsx                       # AuthProvider + ToastProvider + Header
│   ├── page.tsx                         # Landing：URL 输入 + 模式选择
│   ├── analyze/[videoId]/page.tsx       # 双栏分析工作台（核心）
│   ├── v/[slug]/page.tsx                # SEO 分享页（缓存命中直出）
│   ├── my-videos/page.tsx               # 我的视频（历史 + 收藏）
│   ├── all-notes/page.tsx               # 所有笔记（聚合搜索）
│   ├── settings/page.tsx                # 默认 mode、默认翻译目标语言等
│   ├── auth/                            # OAuth callback 等
│   └── api/
│       ├── transcript/route.ts
│       ├── video-info/route.ts
│       ├── check-video-cache/route.ts
│       ├── video-analysis/route.ts
│       ├── update-video-analysis/route.ts
│       ├── save-analysis/route.ts
│       ├── generate-topics/route.ts
│       ├── generate-summary/route.ts
│       ├── quick-preview/route.ts
│       ├── top-quotes/route.ts
│       ├── suggested-questions/route.ts
│       ├── chat/route.ts
│       ├── translate/route.ts
│       ├── notes/route.ts
│       ├── notes/all/route.ts
│       ├── toggle-favorite/route.ts
│       ├── link-video/route.ts
│       ├── verify-video-link/route.ts
│       ├── check-limit/route.ts
│       └── csrf-token/route.ts
├── components/                          # 与 longcut 一一对应（去掉 stripe/email 相关）
├── contexts/
│   ├── auth-context.tsx
│   └── play-all-context.tsx
├── lib/
│   ├── supabase/{client,server,middleware,admin,types}.ts
│   ├── ai-providers/{registry,provider-config,types,minimax-adapter,index}.ts
│   ├── ai-client.ts
│   ├── ai-processing.ts                 # 五件套统一编排
│   ├── translation/{index,types,client,llm-translate-client}.ts
│   ├── translation-batcher.ts
│   ├── prompts/{topics,summary,quotes,questions,chat,takeaways}.ts
│   ├── youtube-transcript-provider.ts   # InnerTube 三身份
│   ├── supadata-transcript-provider.ts  # 新增：付费兜底
│   ├── transcript-format-detector.ts
│   ├── transcript-sentence-merger.ts
│   ├── video-info-provider.ts
│   ├── quote-matcher.ts                 # Boyer-Moore + n-gram + offset 还原
│   ├── timestamp-utils.ts
│   ├── timestamp-normalization.ts
│   ├── sentence-utils.ts
│   ├── topic-utils.ts
│   ├── notes-client.ts
│   ├── csrf-protection.ts / csrf-client.ts
│   ├── rate-limiter.ts
│   ├── security-middleware.ts
│   ├── audit-logger.ts
│   ├── sanitizer.ts
│   ├── promise-utils.ts                 # AbortManager / backgroundOperation / safePromise
│   ├── access-control.ts
│   ├── schemas.ts                       # 共用 Zod
│   ├── validation.ts
│   ├── language-utils.ts
│   ├── transcript-language.ts
│   ├── video-info-provider.ts
│   ├── video-save-utils.ts
│   ├── webview-detector.ts
│   ├── hooks/use-mode-preference.ts
│   ├── hooks/use-translation.ts
│   └── types.ts
├── middleware.ts                        # CSP/HSTS + Supabase 会话刷新
├── supabase/migrations/                 # 仅保留核心表 + 安全表（去除 Stripe/email）
├── public/
└── package.json
```

---

## 3. 章节一：视频摄取与转写（Ingestion）

### 3.1 流程

```
URL ──extractVideoId──▶ videoId
        │
        ├─▶ /api/check-video-cache (Supabase video_analyses lookup)
        │       │
        │       └── HIT: 直接返回缓存 → /v/[slug] 或秒开 /analyze
        │
        └─▶ MISS: 并行启动
                ├─ /api/video-info     ← YouTube oEmbed (10s timeout)
                └─ /api/transcript     ← 三段式抓取 (30s timeout)
                        │
                        ├─ Step 1：InnerTube 三身份免费抓取
                        │     - Android client（默认）
                        │     - Web client
                        │     - iOS client
                        │   每身份独立 clientName / clientVersion / userAgent / apiKey；遇到 EU
                        │   consent redirect 先跟 cookie，再重试。
                        │
                        ├─ Step 2：transcript-format-detector
                        │     采样前 100 段，按"句末标点占比 + 平均句长"判断旧格式 vs 新格式；
                        │     旧格式触发 transcript-sentence-merger（最长 24s / 80 词 / 20 段一句）。
                        │
                        └─ Step 3：失败兜底 → Supadata
                                调用 SUPADATA_API_KEY，付费拿料；用同一个
                                normalizeSegments() 输出统一 TranscriptSegment[]。
```

### 3.2 关键设计

- **零摩擦输入**：landing 页与 analyze 头部都用 `<UrlInput />`，`extractVideoId()` 兼容 `youtu.be` / `youtube.com/watch` / `youtube.com/shorts` / `youtube.com/embed` 五种形态。
- **缓存优先**：`/api/check-video-cache` 仅做 `youtube_id` lookup（select 必要字段，避免 JSONB 全量），命中直接命中 `video_analyses` row；UI 切到 `LOADING_CACHED` state。
- **可降级**：`youtube-transcript-provider.ts` 抛出 `TRANSCRIPT_BLOCKED` / `TRANSCRIPT_NOT_FOUND` 时，自动 fallback 到 `supadata-transcript-provider.ts`；两条路径输出统一 `TranscriptSegment[]`（`{text, start, duration, translatedText?}`），调用方无感知。
- **超时**：metadata 10s、transcript 30s（`AbortManager.createController('transcript', 30_000)`）。

### 3.3 Supadata 集成

```ts
// lib/supadata-transcript-provider.ts
const SUPADATA_BASE = 'https://api.supadata.ai/v1';
async function fetchSupadataTranscript(videoId: string, signal: AbortSignal) {
  const r = await fetch(`${SUPADATA_BASE}/youtube/transcript?videoId=${videoId}`, {
    headers: { 'x-api-key': process.env.SUPADATA_API_KEY! },
    signal,
  });
  if (!r.ok) throw new TranscriptError('SUPADATA_FAILED', r.status);
  const data = await r.json(); // { content: [{ text, offset, duration }, ...] }
  return data.content.map(s => ({ text: s.text, start: s.offset / 1000, duration: s.duration / 1000 }));
}
```

`/api/transcript` 中的尝试链：

```ts
const tryChain = [
  () => fetchInnertube(videoId, 'ANDROID', signal),
  () => fetchInnertube(videoId, 'WEB',     signal),
  () => fetchInnertube(videoId, 'IOS',     signal),
  () => fetchSupadataTranscript(videoId, signal),  // 兜底
];
```

---

## 4. 章节二：AI Provider 适配层（仅 MiniMax）

### 4.1 结构

```
lib/ai-providers/
├── types.ts             ProviderAdapter / ProviderGenerateParams / ProviderGenerateResult
├── provider-config.ts   resolveProviderKey() / behavior flags（首版只有 minimax 一项）
├── registry.ts          getProvider(key) 单例缓存
├── minimax-adapter.ts   ★ 唯一具体实现
└── index.ts             export *
```

> **设计取舍**：首版只交付 MiniMax 一个 Provider。`ProviderAdapter` 接口与 Registry 仍然保留，让"未来添加新供应商"成本最小化（新增 adapter 文件 + 在 `provider-config.ts` 注册），但**不引入未使用的代码路径**。Grok / Gemini 适配器与 cross-provider fallback 一律不在本 release 范围。

### 4.2 ProviderAdapter 接口

```ts
export interface ProviderGenerateParams<T = unknown> {
  prompt: string;
  model?: string;
  temperature?: number;     // default 0.4
  topP?: number;            // default 0.9
  maxOutputTokens?: number;
  timeoutMs?: number;       // 默认 60_000
  zodSchema?: z.ZodType<T>; // 若提供则结构化输出
  metadata?: Record<string, unknown>; // 用于 audit / log
}

export interface ProviderAdapter {
  name: 'minimax';          // 类型 union 后续扩展时再放宽
  defaultModel: string;
  generate<T>(p: ProviderGenerateParams<T>): Promise<ProviderGenerateResult<T>>;
}
```

### 4.3 解析与重试

```
AI_PROVIDER=minimax    → resolveProviderKey() 始终返回 'minimax'
AI_PROVIDER 未设置     → 默认 'minimax'
其它值                  → throw ConfigError（首版不容忍未知 provider，避免静默 fallback）

generateAIResponse(prompt, opts)
  └─ getProvider('minimax').generate(...)
       ├─ 成功 → 返回 result
       ├─ 命中 retryable (429/500/503/timeout) → 同 Provider 内指数退避重试 ≤2 次
       └─ 仍失败 → 抛出 ProviderError，上层 backgroundOperation / Promise.allSettled 接住
```

> **没有 cross-provider fallback** — 由 MiniMax 单点稳定性 + 内部重试承担 SLA。如未来引入 Grok/Gemini，再补 `getProviderFallbackOrder()` 即可。

### 4.4 行为开关

```ts
// provider-config.ts
const BEHAVIOR = {
  minimax: {
    forceSmartModeOnClient: true,
    supportsStructuredOutput: true,
    retryable: [429, 500, 502, 503, 504],
    maxRetries: 2,
    backoffMs: [500, 2000],
  },
};
```

业务侧只调用 `generateAIResponse(prompt, { zodSchema, timeoutMs })` 或 `generateStructuredContent(prompt, schema, opts)`，永远不感知 Provider。

---

## 5. 章节三：AI 内容生成五件套（并行）

### 5.1 五件套定义

| # | 名称 | API | Schema 输出 | 模型策略 |
|---|---|---|---|---|
| 1 | 精华片段（Highlight Reels / Topics） | `/api/generate-topics` | `Topic[]` + `TopicCandidate[]` | **仅 Smart**：长视频用 `proModel` 单次扫全文 |
| 2 | 结构摘要（Summary Takeaways） | `/api/generate-summary` | `{takeaways: [{label, insight, timestamps}]}` | Smart |
| 3 | 闪电预览（Quick Preview） | `/api/quick-preview` | `{preview: {title, summary, glance}}` | Smart，目标首屏 1–2s |
| 4 | 推荐问题（Suggested Questions） | `/api/suggested-questions` | `{questions: string[]}` | Smart，背景任务 |
| 5 | 金句（Top Quotes） | `/api/top-quotes` | `[{title, quote, timestamp}]` | Smart |

> **明确取消 Fast 模式**：UI 不暴露切换；`useModePreference()` 暴露的 `mode` 仍然保留 schema 字段（向后兼容老缓存），但 `setMode()` 写入只允许 `'smart'`。

### 5.2 并行编排

```ts
// app/analyze/[videoId]/page.tsx 简化版
const ctrl = abortMgr.createController('analyze', 60_000);
const [transcript, videoInfo] = await Promise.all([
  fetchTranscript(videoId, ctrl.signal),  // 30s
  fetchVideoInfo(videoId, ctrl.signal),   // 10s
]);

// 闪电预览先跑，触发首屏（非阻塞）
backgroundOperation('quick-preview', () =>
  fetch('/api/quick-preview', { signal: ctrl.signal, body: JSON.stringify({ transcript, videoInfo }) }));

// 五件套主任务（除 preview 外）— Promise.allSettled 单点失败不阻塞
const [topics, summary, quotes, questions] = await Promise.allSettled([
  fetch('/api/generate-topics',    { signal, body: JSON.stringify({ transcript, videoInfo, mode: 'smart' }) }),
  fetch('/api/generate-summary',   { signal, body: JSON.stringify({ transcript, videoInfo }) }),
  fetch('/api/top-quotes',         { signal, body: JSON.stringify({ transcript, videoInfo }) }),
  fetch('/api/suggested-questions',{ signal, body: JSON.stringify({ transcript, videoInfo }) }),
]);

// DB 持久化走 backgroundOperation，不阻 UI
backgroundOperation('save-analysis', () => saveAnalysis({ ... }));
```

### 5.3 提示词组织

`lib/prompts/` 一文件一模板，全部以函数导出 `buildXxxPrompt({transcript, videoInfo, language, ...}): string`。所有响应使用 Zod schema（`lib/schemas.ts`）做结构校验，失败 → fallback prompt 简化版重试一次。

---

## 6. 章节四：双栏分析工作台

### 6.1 布局

```
┌──────────────────────────────────────────────────────────────────────┐
│  VideoHeader  (title · author · favorite · share · language)          │
├────────────────────────────────────┬─────────────────────────────────┤
│  YouTubePlayer  (autoPlay segments)│  RightColumnTabs                │
│      ▲ PlaybackCommand bus         │  ├─ Summary    (summary-viewer) │
│  ────────────────────────────────  │  ├─ Chat       (ai-chat)        │
│  VideoProgressBar                  │  ├─ Transcript (transcript-viewer)│
│      ▲ topic 颜色着色 + 当前进度    │  └─ Notes      (notes-panel)    │
│  ────────────────────────────────  │                                 │
│  HighlightsPanel                   │                                 │
│  ├─ ThemeSelector                  │                                 │
│  └─ TopicCard × 5（baseTopics）     │                                 │
└────────────────────────────────────┴─────────────────────────────────┘
```

### 6.2 PlaybackCommand 共享总线

```ts
// lib/types.ts
export type PlaybackCommandType =
  | 'SEEK' | 'PLAY' | 'PAUSE'
  | 'PLAY_TOPIC' | 'PLAY_SEGMENT' | 'PLAY_ALL' | 'PLAY_CITATIONS';

export interface PlaybackCommand {
  type: PlaybackCommandType;
  time?: number;
  topic?: Topic;
  segment?: { start: number; end: number };
  citations?: Citation[];
  autoPlay?: boolean;
}
```

`youtube-player.tsx` 订阅 `PlaybackCommand`：
- `SEEK` → `player.seekTo(time)`
- `PLAY_SEGMENT` → seek + 监听 `currentTime ≥ segment.end` 自动 pause
- `PLAY_TOPIC` → 链式 `PLAY_SEGMENT`（多段）
- `PLAY_ALL` → 通过 `play-all-context.tsx` 把所有 baseTopics 串播
- `PLAY_CITATIONS` → 把 chat 引文 `Citation[]` 视作 `PLAY_TOPIC` 的子集

时间轴着色：`VideoProgressBar` 根据 `topics[].segments[].{start,end}` + `getTopicHSLColor()` 染色，鼠标悬停显示 topic title。

### 6.3 RightColumnTabs

- **Summary**：`react-markdown` + `remark-gfm` 渲染 takeaways；时间戳点击 → `dispatch({type: 'SEEK', time})`。
- **Chat**：见章节六。
- **Transcript**：左侧时间戳 + 文本；当前播放位置自动滚到视野；选中区域弹 `<SelectionActions />`（保存为 Note / 翻译 / 跳转）。
- **Notes**：见章节七。

---

## 7. 章节五：Transcript 引擎（对齐 + 检索）

### 7.1 三段式策略（`lib/quote-matcher.ts`）

```
LLM 引文（可能含改写、缺标点、换大小写）
        │
        ▼
Step 1: Boyer-Moore 精确匹配
        │  bad-char + good-suffix table；O(n/m) 期望
        │  命中 → 直接拿 startSegmentIdx + charOffset
        ▼ MISS
Step 2: 归一化匹配
        normalizeText(): lowercase + 去标点 + 折叠空白
        在 normalizedText 上跑 Boyer-Moore；命中后用 segmentBoundaries[].normalizedText
        反推回原始 charOffset
        ▼ MISS
Step 3: 3-gram Jaccard 模糊匹配
        阈值 FUZZY_MATCH_THRESHOLD = 0.85
        wordIndex 引导候选窗口（避免 O(n²)）
        相似度 = |A∩B| / |A∪B|，A/B 为 3-gram set
        命中 → 标记 confidence < 1，UI 上以"近似"样式提示
```

### 7.2 索引结构

```ts
interface TranscriptIndex {
  fullTextSpace:     string;                      // segments.join(' ')
  normalizedText:    string;                      // normalize(fullTextSpace)
  segmentBoundaries: { segmentIdx, startPos, endPos, text, normalizedText }[];
  wordIndex:         Map<string, number[]>;       // word -> segment indices
  ngramIndex:        Map<string, Set<number>>;    // 3-gram -> segment indices
}
```

构建一次（视频加载完成）；后续所有 `matchQuote(quote)` / `matchCitation(text)` 调用都重用。

### 7.3 输出契约

```ts
interface MatchResult {
  startSegmentIdx: number;
  endSegmentIdx:   number;
  startCharOffset: number;   // 句内字符偏移
  endCharOffset:   number;
  matchStrategy:   'exact' | 'normalized' | 'fuzzy';
  similarity?:     number;   // 仅 fuzzy
  confidence:      number;   // exact=1, normalized=0.95, fuzzy=similarity
}
```

UI 用 `startSegmentIdx + startCharOffset` 在 transcript-viewer 内做字符级 `<mark>`；用 `start` 时间戳做 `SEEK`。

### 7.4 句子合并 / 多格式探测

- `transcript-format-detector.ts`：采样前 100 段，按"句末标点占比 + 平均句长"识别旧格式（短碎片）vs 新格式（整句）。
- `transcript-sentence-merger.ts`：旧格式触发合并；合并约束 `MAX_SENTENCE_DURATION=24s` / `MAX_WORDS=80` / `MAX_SEGMENTS=20`，超限优先在标点切；保留原始 `start` 时间戳。
- 输出统一供 `quote-matcher` 消费，避免索引在两套粒度下飘移。

---

## 8. 章节六：AI Chat（带引用）

### 8.1 上下文锁定

```ts
// app/api/chat/route.ts
const systemPrompt = buildChatSystemPrompt({
  transcript,            // 完整 transcript（必须）
  topics,                // 已生成的 topics（可选上下文）
  videoInfo,             // title / author，用于消歧
  targetLanguage,
  forbidExternal: true,  // ⬅️ 强制：不得引用 transcript 外内容
});
```

`buildChatSystemPrompt` 明确写入：

> "Your knowledge is strictly limited to the provided transcript. If the answer is not in the transcript, say so honestly. Every assertion MUST cite [n] referring to a specific segment."

### 8.2 输出 Schema

```ts
const chatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    number: z.number().int().min(1),
    text:   z.string(),                 // LLM 写出的引文（可能不逐字）
    timestamp: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
  })),
});
```

Provider 返回后，Server 端用 `quote-matcher` 把每条 `citation.text` 回锚到 segment：

```ts
const enrichedCitations = response.citations.map(c => {
  const m = matchQuote(transcriptIndex, c.text);
  return { ...c,
    start:           transcript[m.startSegmentIdx].start + offsetToSeconds(m.startCharOffset),
    end:             transcript[m.endSegmentIdx].start + transcript[m.endSegmentIdx].duration,
    startSegmentIdx: m.startSegmentIdx,
    endSegmentIdx:   m.endSegmentIdx,
    startCharOffset: m.startCharOffset,
    endCharOffset:   m.endCharOffset,
  };
});
```

### 8.3 UI 行为

- `chat-message.tsx` 渲染 markdown + `[1][2]` 上标可点击 → `dispatch({type: 'SEEK', time: citation.start})`。
- 顶部按钮 "Play Citations" → `dispatch({type: 'PLAY_CITATIONS', citations})`，串播。
- 引文 `confidence < 1` 时上标加虚线下划线，hover 提示"近似匹配"。

---

## 9. 章节七：笔记系统

### 9.1 数据模型（`lib/types.ts`）

```ts
export type NoteSource = 'chat' | 'takeaways' | 'transcript' | 'custom';

export interface NoteMetadata {
  transcript?: { start: number; end?: number; segmentIndex?: number; topicId?: string };
  chat?:       { messageId: string; role: 'user' | 'assistant'; timestamp?: string };
  takeaway?:   { label: string; insightId?: string };
  selectedText?: string;
}

export interface Note {
  id: string;
  userId: string;
  videoId: string;        // FK → video_analyses.id
  source: NoteSource;
  sourceId?: string;      // 来源对象的稳定 ID（chat msg / topic / segment）
  text: string;
  metadata?: NoteMetadata;
  createdAt: string;
  updatedAt: string;
}
export interface NoteWithVideo extends Note {
  video: { youtubeId: string; title: string; author: string; thumbnail: string; duration: number };
}
```

### 9.2 来源 → 创建路径

| 来源 | 触发组件 | metadata 关键字段 |
|---|---|---|
| transcript | `<SelectionActions />` 选段右键 | `transcript.{start, end, segmentIndex}` + `selectedText` |
| chat | `<ChatMessage />` 的 "Save as note" | `chat.{messageId, role}` |
| takeaways | `<SummaryViewer />` 每条 takeaway 旁的 + 按钮 | `takeaway.{label, insightId}` |
| custom | `<NotesPanel />` 自由输入框 | 仅 `text` |

### 9.3 API（CSRF 必需）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/api/notes?youtubeId=` | 拿单视频笔记 | required |
| POST | `/api/notes` | 创建 | required |
| DELETE | `/api/notes?id=` | 删除 | required |
| GET | `/api/notes/all` | 跨视频聚合，供 `/all-notes` | required |

客户端 `lib/notes-client.ts` 暴露 `fetchNotes / saveNote / deleteNote / fetchAllNotes / enhanceNoteQuote`，全部走 `csrfFetch`。

### 9.4 `/all-notes` 页

- 默认按 `updatedAt desc`；筛选：source / 视频 / 时间范围
- 全文搜索：客户端 `Note.text` + 服务端 ILIKE（短词走客户端、长词走服务端，阈值 24 字符）
- 点击笔记 → 跳到 `/analyze/[youtubeId]?focusNote={id}`，分析页 mount 后还原选中状态 + `SEEK` 到时间戳

---

## 10. 章节八：用户与个人空间

### 10.1 匿名 → 登录回填

```
匿名用户：
  1. 输入 URL → /analyze/[videoId]
  2. 后端写 video_analyses 但 user_id = null（或 user_videos 不写）
  3. UI 顶部出现 "Save to your library" → 触发 <AuthModal />
  4. sessionStorage.setItem('pendingVideoId', videoId)

登录后（contexts/auth-context.tsx）：
  onAuthStateChange(SIGNED_IN) →
    pending = sessionStorage.getItem('pendingVideoId')
    if pending:
      retry(/api/link-video {videoId: pending}, exponentialBackoff [200, 500, 1500] ms)
        - 200: 成功 → 清 pending → 刷新 /my-videos 数据
        - 404: video 还没 commit → 重试
        - 401: 鉴权异常 → 提示重新登录
```

`/api/link-video` 实现：
1. 校验 `video_analyses.youtube_id == videoId` 存在
2. 校验 / 创建 `profile`（OAuth 注册可能没立即 trigger）
3. `user_videos` upsert：`{user_id, video_id, accessed_at, is_favorite=false}`

### 10.2 路由

| 路径 | 用途 | 鉴权 |
|---|---|---|
| `/` | Landing + URL 输入 | public |
| `/analyze/[videoId]` | 双栏工作台 | public（匿名可用） |
| `/v/[slug]` | SEO 分享页（缓存命中） | public |
| `/my-videos` | 历史 + 收藏 | authenticated |
| `/all-notes` | 聚合笔记 | authenticated |
| `/settings` | 默认 mode、目标语言、显示密度等 | authenticated |
| `/auth/callback` | OAuth 回调 | system |

> **去除**：`/pricing`, `/unsubscribe`（邮件营销）。

### 10.3 偏好持久化

`useModePreference()` 双写：
- 已登录：`profiles.topic_generation_mode`
- 未登录：`localStorage['vidinsight-mode-preference']`
- 登录瞬间：localStorage → profiles 一次性同步，再清 localStorage

同模式还有 `useTranslationPreference()`、`useThemePreference()`（UI 主题）等，统一通过 `lib/hooks/` 提供。

---

## 11. 章节十：翻译子系统

> （用户列出的章节序号跳过九、十一，本节对应"十、翻译子系统"。）

### 11.1 场景路由

```ts
type TranslationScenario = 'transcript' | 'chat' | 'topic' | 'general';

const PROMPT_BY_SCENARIO: Record<TranslationScenario, (ctx) => string> = {
  transcript: ctx => `严格逐字翻译，保留 [time] 标签…`,           // 准确度优先
  chat:       ctx => `保持 markdown 与 [n] 引用编号不变…`,        // 渲染一致性
  topic:      ctx => `保留专有名词，同时翻译标题与 quote…`,        // 含 keywords 上下文
  general:    ctx => `通用翻译…`,
};
```

### 11.2 调用链

```
组件 useTranslation(scenario, target)
   ▼
translation-batcher.ts 队列
   - 收到 translate(text, scenario, target)
   - 命中 in-memory cache(key=hash(text+scenario+target)) → 立即返回
   - 否则入队，等 batchDelay (50ms) 或队列长度 ≥ maxBatchSize (35) 触发 flush
   ▼
POST /api/translate { texts[], scenario, target, context? }
   ▼
withSecurity(AUTHENTICATED) 包装
   ▼
LLMTranslateClient.translate
   - generateAIResponse(prompt, { temperature: 0.3, zodSchema })
   - 大批次切块（>35 条），用 <<<TRANSLATION>>> 分隔解析
   - 失败重试 ≤ 3 次（指数退避）
   ▼
返回 { translations: string[] }，batcher 写回 cache + resolve 各调用
```

### 11.3 性能/成本

- **去重**：同一文本同一 scenario+target 全局只调一次
- **合并**：一次 HTTP 最多 35 条
- **不调 Google Translate API**：所有翻译走 LLM 路径（与 longcut 一致），免维护额外 key 与配额
- **必须登录**：减少滥用且对应章节八（匿名只读，翻译需账号）

---

## 12. 章节十二：安全与基础设施

### 12.1 全局 `middleware.ts`

```ts
// middleware.ts
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // 1) Supabase 会话刷新（cookie-based）
  await refreshSupabaseSession(req, res);

  // 2) 安全头：CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy
  res.headers.set('Content-Security-Policy', buildCSP());
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

CSP 白名单：`youtube.com`, `youtu.be`, `i.ytimg.com`, `*.supabase.co`, `*.minimax-ai.com`（按 Provider 增）, `api.supadata.ai`。

### 12.2 路由层 `withSecurity()`

```ts
export const SECURITY_PRESETS = {
  PUBLIC: {
    methods: ['GET', 'POST'],
    rateLimit: { windowMs: 60_000, max: 30 },
    bodyMaxBytes: 1 * 1024 * 1024,
    requireAuth: false,
    requireCsrf: 'mutating',     // 仅 POST/PUT/PATCH/DELETE
  },
  AUTHENTICATED: {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    rateLimit: { windowMs: 60_000, max: 60 },
    bodyMaxBytes: 5 * 1024 * 1024,
    requireAuth: true,
    requireCsrf: 'mutating',
  },
  STRICT: {                     // 用于 /api/chat、/api/generate-* 等
    methods: ['POST'],
    rateLimit: { windowMs: 60_000, max: 10 },
    bodyMaxBytes: 512 * 1024,
    requireAuth: true,
    requireCsrf: true,
  },
} as const;

// 使用
export const POST = withSecurity(SECURITY_PRESETS.STRICT, async (req, ctx) => {
  const body = sanitizer.sanitizeRequestBody(await req.json());  // DOMPurify
  ...
});
```

链路：method whitelist → auth (Supabase user) → rate limit → body size → CSRF → DOMPurify → handler → audit log → security headers。

### 12.3 CSRF 双 Token

- 服务器：`/api/csrf-token` 生成 32 字节随机 hex，写 HTTP-only cookie `csrf-token`（24h, SameSite=Strict, Secure）
- 客户端：`csrfFetch()` 从 `document.cookie` 读出后塞进 `X-CSRF-Token` header
- 校验：cookie 和 header 必须**完全相等**才放行（double-submit pattern；无需服务器 session 存储）

### 12.4 速率限制 + IP 哈希

`rate_limits` Postgres 表：

```sql
create table rate_limits (
  id          bigserial primary key,
  key         text not null,                 -- e.g. 'ratelimit:chat:abc123'
  identifier  text not null,                 -- user_id 或 sha256(IP).slice(0,16)
  timestamp   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index on rate_limits (key, timestamp desc);
```

- **匿名识别**：`identifier = sha256(req.ip).slice(0,16)` — 不存原始 IP，符合隐私
- **滑动窗口**：count(*) where key=? and timestamp ≥ now() - windowMs
- 超限 → 429 + `Retry-After`

预设：
- `ANON_GENERATION` 1/天（防匿名滥用 AI 流量）
- `AUTH_GENERATION` 20/小时
- `AUTH_CHAT` 30/分钟
- 后台 cron 删 7 天前数据，避免表无限增长

### 12.5 审计日志

```sql
create table audit_logs (
  id            bigserial primary key,
  user_id       uuid references auth.users on delete set null,
  action        text not null,        -- 'video.analyze' / 'note.create' / 'auth.signin' / ...
  resource_type text,                 -- 'video' / 'note' / ...
  resource_id   text,
  details       jsonb,
  ip_hash       text,                 -- 同 rate_limits 一致
  user_agent    text,
  created_at    timestamptz default now()
);
```

`withSecurity` 自动写：401/403/429/500、AI 调用元数据（provider、model、token usage）、笔记/收藏 mutation。

### 12.6 输入清洗

`lib/sanitizer.ts`：服务端 `dompurify + jsdom`，客户端 `dompurify` 直跑。
- 入口：`sanitizeRequestBody(obj)` 递归清洗 string 字段；`sanitizeMarkdown(md)` 用于 chat / summary 渲染前。
- Zod schema 校验类型 + 长度上限（chat message ≤ 8KB，note text ≤ 16KB）。

---

## 13. 章节十三：性能与容错策略

三个互补机制把延迟和故障打散：

### 13.1 并行处理

| 阶段 | 并行项 | 方式 |
|---|---|---|
| 初始加载 | transcript ‖ video-info | `Promise.all`（任一失败即中断） |
| AI 阶段 | topics ‖ summary ‖ quotes ‖ questions | `Promise.allSettled`（失败不阻其他） |
| 闪电预览 | quick-preview | `backgroundOperation` 完全不阻 UI |
| 缓存命中 | 仅缺失字段在 background 重生 | 不阻 UI 显示已缓存内容 |

### 13.2 `backgroundOperation`

```ts
export async function backgroundOperation<T>(
  name: string,
  op: () => Promise<T>,
  onError?: (err: Error) => void,
): Promise<T | null> {
  try { return await op(); }
  catch (e) { console.error(`[bg:${name}]`, e); onError?.(e as Error); return null; }
}
```

用于：DB 写入（save-analysis、update-video-analysis）、suggested-questions、save toggle-favorite、translation 缓存预热。

### 13.3 `AbortManager`

```ts
const mgr = new AbortManager();
const ctrl = mgr.createController('transcript', 30_000);  // key + timeout
fetch('/api/transcript', { signal: ctrl.signal });

useEffect(() => () => mgr.cleanup(), []);  // unmount → abort all
```

超时预设：
- video-info：10s
- transcript：30s
- AI 五件套：60s（注：长视频 smart 模式可放宽到 90s，但默认 60s）
- chat：60s
- translate：30s

切换 videoId / 重新分析时，`mgr.cleanup()` 一次性 abort 全部在飞请求，避免回填脏数据到新页面。

### 13.4 错误降级

| 失败点 | 降级 |
|---|---|
| InnerTube 三身份全失败 | → Supadata |
| MiniMax 429/500/503 | 同 Provider 内指数退避重试 ≤2 次；仍失败抛 ProviderError |
| Topics 失败但 Summary 成功 | UI 仍渲染 Summary，Topics 区显示"重试"按钮 |
| Quote-matcher 没匹配 | 引文渲染为不可点（保留文本），不引发"PLAY"失败 |
| Translation 失败 | UI fallback 到原文，不阻挡阅读 |

---

## 14. 数据库 Schema（Supabase Postgres）

> 移除 longcut 中：`stripe_events / topup_purchases / newsletter_subscriptions / welcome_email_*`。
> 移除 `profiles` 中：`stripe_customer_id / subscription_* / topup_credits`。

```sql
-- 14.1 用户档案（精简）
create table profiles (
  id                       uuid primary key references auth.users on delete cascade,
  email                    text not null,
  full_name                text,
  avatar_url               text,
  topic_generation_mode    text default 'smart' check (topic_generation_mode in ('smart')),
  preferred_target_language text default 'en',
  free_generations_used    int default 0,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- 14.2 视频分析（核心缓存）
create table video_analyses (
  id                 uuid primary key default gen_random_uuid(),
  youtube_id         text unique not null,
  title              text,
  author             text,
  duration           int,
  thumbnail_url      text,
  transcript         jsonb,            -- TranscriptSegment[]
  topics             jsonb,            -- Topic[]
  topic_candidates   jsonb,            -- TopicCandidate[]
  summary            jsonb,            -- takeaways[]
  top_quotes         jsonb,
  suggested_questions jsonb,
  source_language    text,
  model_used         text,             -- e.g. 'minimax:MiniMax-M2.7'
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index on video_analyses (youtube_id);

-- 14.3 用户视频关系（历史 + 收藏）
create table user_videos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles on delete cascade,
  video_id     uuid references video_analyses on delete cascade,
  is_favorite  boolean default false,
  accessed_at  timestamptz default now(),
  unique (user_id, video_id)
);

-- 14.4 笔记
create table user_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles on delete cascade,
  video_id    uuid references video_analyses on delete cascade,
  source      text not null check (source in ('chat','takeaways','transcript','custom')),
  source_id   text,
  text        text not null,
  metadata    jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on user_notes (user_id, updated_at desc);
create index on user_notes (video_id);

-- 14.5 速率限制
create table rate_limits (
  id          bigserial primary key,
  key         text not null,
  identifier  text not null,
  timestamp   timestamptz default now()
);
create index on rate_limits (key, timestamp desc);

-- 14.6 审计日志
create table audit_logs (
  id            bigserial primary key,
  user_id       uuid references auth.users on delete set null,
  action        text not null,
  resource_type text,
  resource_id   text,
  details       jsonb,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz default now()
);

-- 14.7 RLS
alter table profiles      enable row level security;
alter table video_analyses enable row level security;
alter table user_videos   enable row level security;
alter table user_notes    enable row level security;

create policy "video_analyses_read" on video_analyses for select using (true);
create policy "video_analyses_write" on video_analyses for insert with check (true);
create policy "video_analyses_update" on video_analyses for update using (true);

create policy "user_videos_self" on user_videos
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_notes_self" on user_notes
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profiles_self" on profiles
  using (auth.uid() = id) with check (auth.uid() = id);
```

`video_analyses` 表对所有人可读以支撑 `/v/[slug]` 分享与匿名缓存命中；写入由 `withSecurity` 在应用层鉴权。

---

## 15. 环境变量

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 仅服务端：admin client（link-video 等）

# AI Provider（唯一：minimax）
AI_PROVIDER=minimax
NEXT_PUBLIC_AI_PROVIDER=minimax     # 客户端展示一致
AI_DEFAULT_MODEL=MiniMax-M2.7
MINIMAX_API_KEY=

# 转写兜底
SUPADATA_API_KEY=

# 应用 / 部署（Vercel）
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Vercel 自动注入（无需在 .env 配置，仅记录）：
#   VERCEL_ENV         = production | preview | development
#   VERCEL_URL         = 当前部署 host（含 preview）
#   VERCEL_GIT_COMMIT_SHA
```

`scripts/validate-env.ts`：启动时校验必填变量（Supabase 三项 + Minimax key + Supadata key），缺失则 `process.exit(1)`。Vercel 平台变量不在校验列表（生产由平台保证注入）。

---

## 16. 与 longcut 的差异清单

| 模块 | longcut | VidInsight |
|---|---|---|
| 计费 | Stripe 订阅 + topup | ❌ 完全移除 |
| 邮件 | Postmark welcome / unsubscribe / newsletter | ❌ 完全移除 |
| 部署 | Vercel + `@vercel/analytics` | ✅ **保留 Vercel + Analytics** |
| AI Provider | Minimax / Grok / Gemini 三家 | ✅ **仅 MiniMax**（接口预留扩展） |
| 转写 | InnerTube 三身份 | ✅ **InnerTube 三身份 + Supadata 兜底** |
| 模式 | `smart` + `fast` | ✅ **仅 `smart`** |
| 图像生成 | `/api/generate-image`（Gemini） | ❌ 暂不开放 |
| 翻译 | LLM + Google API 双路 | ✅ **仅 LLM 路径** |
| 数据库 | profiles 含 stripe/topup 字段 | ✅ **精简版 profiles** |
| 鉴权 | Supabase Auth | ✅ 不变 |
| 安全栈 | `withSecurity` + CSRF + 速率限制 + 审计 | ✅ 不变 |
| Quote Matcher | Boyer-Moore + n-gram | ✅ 不变 |
| Promise Utils | AbortManager / backgroundOperation / safePromise | ✅ 不变 |
| PlaybackCommand | SEEK / PLAY_TOPIC / PLAY_SEGMENT / PLAY / PAUSE / PLAY_ALL / PLAY_CITATIONS | ✅ 不变 |

---

## 17. Vercel 集成

参考 `vendors/longcut`：`app/layout.tsx` 注入 `<Analytics />`、`lib/utils.ts:resolveAppUrl()` 利用 `VERCEL_ENV` / `VERCEL_URL` 在 preview 部署里自动选择正确 origin、`middleware.ts` 在 Vercel Edge runtime 上跑 Supabase session 刷新。VidInsight 沿用同模式：

### 17.1 依赖与开关

- `package.json` 保留 `@vercel/analytics` ^1.5.0
- `app/layout.tsx`：`import { Analytics } from '@vercel/analytics/react'`，在 `<body>` 末挂载 `<Analytics />`
- 仅在 `VERCEL_ENV` 存在时启用；本地 dev 不上报（`@vercel/analytics` 自身 noop）

### 17.2 多环境 origin 解析

```ts
// lib/utils.ts —— 同 longcut
export function resolveAppUrl(fallbackOrigin?: string) {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const vercelUrl = process.env.VERCEL_URL;          // e.g. vidinsight-git-feat-x.vercel.app
  if (isPreview) {
    return fallbackOrigin ?? (vercelUrl ? `https://${vercelUrl}` : '');
  }
  return process.env.NEXT_PUBLIC_APP_URL
      ?? (vercelUrl ? `https://${vercelUrl}` : '')
      ?? (typeof window !== 'undefined' ? window.location.origin : '');
}
```

应用场景：
- OAuth redirect URL（Supabase Auth）— preview 部署需要 `https://${VERCEL_URL}/auth/callback`
- `/v/[slug]` 分享页 canonical / og:url
- 邮件 / 推送（暂未实装）拼绝对链接

### 17.3 Edge Runtime 与中间件

- `middleware.ts` 默认在 Vercel Edge Runtime 上跑，不要在其中引入仅 Node 可用的依赖（如 `jsdom`、`crypto.subtle` 以外的 Node `crypto`）
- Supabase session 刷新通过 `@supabase/ssr` 的 cookie API 完成，原生兼容 Edge
- 速率限制和审计写库走 API 路由（默认 Node Runtime），不在 Edge middleware 里访问 Postgres

### 17.4 Preview / Production 行为差异

| 维度 | Production | Preview | Local |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 生产域名 | 不设；走 `VERCEL_URL` | `http://localhost:3000` |
| Vercel Analytics | 启用 | 启用（独立 namespace） | 关闭（noop） |
| Supabase OAuth redirect | 生产域 + 通配 preview 域 | 同左 | localhost |
| Rate limit 表共享 | ✅ 同库 | ✅ 同库（preview 数据可清） | dev DB |
| Audit log | ✅ | ✅ | ✅ |

### 17.5 部署配置（仓库根 `vercel.json`，可选）

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "regions": ["iad1"],
  "functions": {
    "app/api/generate-topics/route.ts":   { "maxDuration": 90 },
    "app/api/chat/route.ts":              { "maxDuration": 60 },
    "app/api/transcript/route.ts":        { "maxDuration": 30 },
    "app/api/translate/route.ts":         { "maxDuration": 30 }
  },
  "crons": [
    { "path": "/api/cron/cleanup-rate-limits", "schedule": "0 3 * * *" }
  ]
}
```

- AI 五件套默认 60s，Topics 单独放宽到 90s（长视频）
- Cron 每天 03:00 清理 7 天前的 `rate_limits` 行（替代 Supabase scheduled function，统一在 Vercel 管理）

### 17.6 必配的 Vercel 项目环境变量

- 全部 `.env.local.example` 中的应用变量（Supabase ×3 / MiniMax / Supadata / `NEXT_PUBLIC_APP_URL` 仅 production 设）
- `VERCEL_*` 由平台自动注入，**不要**手动添加

---

## 18. 实施里程碑（建议）

| 阶段 | 范围 | 依赖 |
|---|---|---|
| **M1 摄取与缓存** | extractVideoId / oEmbed / InnerTube 三身份 / Supadata / `video_analyses` 缓存 / `/api/check-video-cache` | Supabase 表已建 |
| **M2 AI 适配 + 五件套** | MiniMax 适配器 + Registry / generate-topics / generate-summary / quick-preview / top-quotes / suggested-questions | M1 |
| **M3 双栏工作台** | YouTube Player / HighlightsPanel / RightColumnTabs / Transcript Viewer / VideoProgressBar / PlaybackCommand | M2 |
| **M4 引文 + Chat** | quote-matcher + /api/chat + chat-message + Play Citations | M3 |
| **M5 笔记** | user_notes 表 / notes-client / NotesPanel / SelectionActions / /all-notes | M3 |
| **M6 用户体系** | Auth modal / link-video / my-videos / settings / useModePreference | M2 |
| **M7 翻译** | translation-batcher / /api/translate / 三 scenario prompts | M4 |
| **M8 安全 & Vercel 上线** | middleware.ts CSP/HSTS / withSecurity 全 API 套用 / RLS / audit_logs / rate_limits / Vercel 部署 + Analytics + Cron | 全部 |

---

> **状态**：v0.1 设计草案，待评审后切 0002 实施计划。
