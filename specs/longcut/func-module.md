# LongCut 功能模块梳理

下面按类别梳理 `vendors/longcut`（一个 Next.js 15 + Supabase + 多 AI 提供商的"YouTube 长视频→学习工作台"项目）的核心功能模块。

## 1. 应用页面 / 路由（`app/`）
- **落地页 `app/page.tsx`**：URL 输入 + Smart/Fast 模式选择，触发限额时弹出登录。
- **分析工作台 `app/analyze/[videoId]/page.tsx`**：双栏布局（播放器+精彩片段 / 摘要+对话+字幕+笔记），统一编排状态机与 PlaybackCommand。
- **公共视频页 `app/v/[slug]/`**：SEO 友好的可分享视频页面，按 slug 解析 YouTube ID。
- **用户库 `app/my-videos/`**：登录用户的历史分析（搜索、收藏、快速恢复）。
- **聚合笔记 `app/all-notes/`**：跨视频笔记仪表盘（筛选、排序、Markdown）。
- **设置 `app/settings/`**：资料、密码、用量、首选生成模式。
- **价格页 `app/pricing/`**：订阅与 Top-up 加购方案展示。
- **辅助页**：`app/auth/callback`（OAuth 回调）、`app/unsubscribe`、`app/privacy`、`app/terms`、`app/sitemap.ts`、`app/robots.ts`。

## 2. AI Provider 抽象层（`lib/ai-providers/`）
- **`registry.ts`**：Provider 工厂/缓存，按环境变量解析 provider，错误时按规则跨 provider 回退。
- **`provider-config.ts`**：Provider key 归一化、优先级与 fallback 顺序解析。
- **`gemini-adapter.ts` / `grok-adapter.ts` / `minimax-adapter.ts`**：三个具体提供商适配器，统一结构化输出、超时与重试。
- **`types.ts` / `client-config.ts`**：ProviderAdapter 接口、生成参数/结果协议、客户端可见的行为标志。
- **`lib/ai-client.ts`**：对外的 `generateAIResponse / generateAIResult` 封装，抹平所有 provider 差异。

## 3. AI 内容生成核心
- **`lib/ai-processing.ts`（53k，最大文件）**：Prompt 构建、字幕分块、候选话题池、Smart vs Fast 模式、按主题重生成、按 provider 行为切换全文/分片策略。
- **`lib/prompts/takeaways.ts`**：「关键要点」聊天 Prompt 模板。
- **`lib/schemas.ts`**：话题生成、聊天回答的 Zod 结构化输出 schema。
- **`lib/json-utils.ts`**：容错解析 AI 返回的非法 JSON（修复、去 code fence）。
- **API 路由**：`/api/generate-topics`（含 theme/excludeKeys）、`/api/generate-summary`、`/api/quick-preview`、`/api/suggested-questions`、`/api/top-quotes`、`/api/chat`（带时间戳引用）、`/api/notes/enhance`（AI 净化笔记引文中的口头语）。

## 4. 视频元数据 & YouTube 字幕抓取
- **`lib/youtube-transcript-provider.ts`**：直接调用 YouTube InnerTube API 拉字幕，伪装 Android/Web/iOS 三种客户端做反爬回退；定义详细错误码。
- **`lib/transcript-format-detector.ts`**：基于标点率判断字幕是「碎句」还是「整句」格式。
- **`lib/transcript-sentence-merger.ts`**：把碎片字幕合并为完整句子（带最大时长/词数防护）。
- **`lib/sentence-utils.ts`**：通用断句（缩写、小数、引号兼容）。
- **`lib/transcript-language.ts` / `lib/video-info-provider.ts`**：字幕语种探测、视频元数据 fetch 封装。
- **API**：`/api/transcript`、`/api/video-info`（YouTube oEmbed + fallback）、`/api/random-video`（随机/探索）。

## 5. 引用定位 & 时间戳
- **`lib/quote-matcher.ts`**：Boyer-Moore 精确匹配 + 3-gram Jaccard 模糊匹配，构建字幕索引并回填字符级偏移。
- **`lib/topic-utils.ts`**：话题段标准化与字幕段映射。
- **`lib/timestamp-utils.ts` / `lib/timestamp-normalization.ts`**：时间戳正则解析、范围解析、与字幕对齐归一化。

## 6. 翻译子系统
- **`lib/translation/llm-translate-client.ts`**：基于当前 AI provider 的批量翻译客户端，使用分隔符协议，支持部分失败重试。
- **`lib/translation-batcher.ts`**：客户端请求合并器（状态机、节流、缓存、限流处理）。
- **`lib/hooks/use-translation.ts`**：管理目标语言、缓存、批量请求的 React Hook。
- **`/api/translate`** + **`lib/language-utils.ts`**：受保护的批量翻译端点和语言代码→名称映射。

## 7. 字幕导出
- **`lib/transcript-export.ts`**：生成 txt / srt / csv（原文/译文/双语模式，可选说话人和时间戳）。
- **`lib/hooks/use-transcript-export.ts`**：协调鉴权、订阅检查与批量翻译的导出流程。
- **`components/transcript-export-dialog.tsx`** + **`transcript-export-upsell.tsx`**：导出弹窗与免费用户升级提示。

## 8. 用户笔记
- **`/api/notes` (CRUD) + `/api/notes/all` + `/api/notes/enhance`**：基础读写、跨视频拉取、AI 美化引文。
- **`lib/notes-client.ts`**：CSRF 保护的客户端封装。
- **组件**：`notes-panel.tsx`（主笔记 Tab）、`note-editor.tsx`（内联编辑）、`selection-actions.tsx`（文字选中的快捷菜单）。

## 9. 鉴权 & 用户会话
- **`contexts/auth-context.tsx`**：Supabase Auth React Context Provider。
- **`lib/supabase/{client,server,middleware,admin,types}.ts`**：浏览器/服务器/admin 三类客户端 + session 刷新中间件。
- **`middleware.ts`**：全局会话刷新 + CSP/HSTS/安全头注入。
- **`components/auth-modal.tsx` / `user-menu.tsx`**：登录/注册弹窗与用户下拉。
- **`lib/webview-detector.ts`**：识别 in-app 浏览器以警示 OAuth 不可用。
- **`lib/access-control.ts`**：环境变量驱动的「无限额度」用户白名单。
- **`/api/auth/signout`、`app/auth/callback/`**：登出与 OAuth 回调。

## 10. 安全 & 限流
- **`lib/security-middleware.ts`**：`withSecurity` 高阶 wrapper（方法白名单、鉴权、限流、Body 大小、CSRF、CORS、安全头），含 `PUBLIC / AUTHENTICATED / AUTHENTICATED_READ_ONLY / STRICT` 预设。
- **`lib/rate-limiter.ts`**：基于 Supabase 表的滑动窗口限流，匿名用户用 IP hash 标识。
- **`lib/csrf-protection.ts` + `lib/csrf-client.ts`**：CSRF token 生成/校验/Cookie 注入 + 客户端自动带 token 的 `csrfFetch`。
- **`lib/audit-logger.ts`**：登录、AI 调用、订阅、限流、未授权访问等事件落库审计。
- **`lib/sanitizer.ts`**：DOMPurify + JSDOM 服务端 HTML 消毒。
- **`lib/validation.ts`**：跨端点共享的 Zod schema。
- **API**：`/api/csrf-token`、`/api/check-limit`、`/api/image-limit`。

## 11. 订阅、计费 & Stripe
- **`lib/subscription-manager.ts`**：订阅状态、计费周期、用量统计、原子化「检查+消费」额度的 RPC 调用、Top-up 信用、Stripe 客户创建/映射。
- **`lib/usage-tracker.ts`**：周期内用量聚合与剩余信用计算。
- **`lib/image-generation-manager.ts`**：图像生成的独立额度/周期/原子消费版本。
- **`lib/stripe-{client,browser,actions,topup}.ts`**：服务端 SDK 单例、浏览器 SDK 加载、客户端 Checkout/Portal 跳转、Top-up 入账与去重。
- **`lib/hooks/use-subscription.ts`**：订阅状态 React Hook。
- **API**：`/api/stripe/{create-checkout-session,create-portal-session,confirm-checkout}`、`/api/subscription/status`、`/api/webhooks/stripe`（处理订阅生命周期与 Top-up 付款）。

## 12. 视频分析持久化
- **API**：`/api/video-analysis`、`/api/save-analysis`、`/api/update-video-analysis`、`/api/check-video-cache`、`/api/link-video`、`/api/verify-video-link`、`/api/toggle-favorite`。
- **`lib/video-save-utils.ts`**：保存的事务化封装；缓存命中时跳过 AI 重生成。

## 13. 图像（视频小抄）生成
- **`/api/generate-image`**：Gemini 生图，4 种艺术风格 × 多种宽高比，受图像额度管理。
- **`components/image-cheatsheet-card.tsx`**：聊天里触发的小抄生成卡片 UI。

## 14. 邮件 & 通讯
- **`lib/email/templates/welcome.ts`、`monthly-update.ts`**：欢迎邮件、月度通讯 HTML 模板。
- **`/api/email/send-welcome` + `/api/newsletter/unsubscribe`**：基于 Postmark 的发件与退订入口。
- **`scripts/send-newsletter.ts`、`send-test-newsletter.ts`**：群发与冒烟脚本。

## 15. 视图组件（核心 UI）
- **播放与高亮**：`youtube-player.tsx`（中心化 PlaybackCommand 系统，支持 Play All 链式播放）、`video-progress-bar.tsx`、`video-header.tsx`、`video-skeleton.tsx`。
- **精彩片段 / 主题**：`highlights-panel.tsx`、`topic-card.tsx`、`theme-selector.tsx`。
- **字幕 / 摘要 / 对话**：`transcript-viewer.tsx`（同步高亮、搜索、选中操作）、`summary-viewer.tsx`、`ai-chat.tsx` + `chat-message.tsx`、`suggested-questions.tsx`、`right-column-tabs.tsx`。
- **输入 / 模式 / 语言**：`url-input.tsx` / `url-input-with-branding.tsx`、`mode-selector.tsx`、`language-selector.tsx`、`timestamp-button.tsx`。
- **状态/反馈**：`loading-context.tsx`、`loading-tips.tsx`、`usage-indicator.tsx`、`toast-provider.tsx`。
- **杂项**：`auth-modal.tsx`、`user-menu.tsx`、`about-modal.tsx`、`footer.tsx`、`selection-actions.tsx`。
- **`components/ui/*`**：shadcn/ui 原语（button、card、dialog、tabs、scroll-area、select、tooltip 等）。

## 16. 其它 Hooks & Context
- **`lib/hooks/use-mode-preference.ts`**：localStorage 持久化 Smart/Fast 偏好。
- **`lib/hooks/use-elapsed-timer.ts`**：加载耗时计时。
- **`lib/hooks/use-in-app-browser.ts`**：WebView 检测。
- **`contexts/play-all-context.tsx`**：跨组件的 Play All 全局状态。
- **`lib/promise-utils.ts`**：AbortManager（集中化 AbortController 生命周期）、`backgroundOperation`、`safePromise` 元组返回。

## 17. 数据库（`supabase/migrations/`）
- 初始 schema、Stripe Phase 1、审计/限流表、原子信用消费、用户回填、图像额度、分析仪表盘、多语言列、欢迎邮件系统、Newsletter 订阅、安全/所有权 RLS、重复消费修复、视频保存事务修复等共 16 个迁移。

## 18. 运维脚本（`scripts/`）
- **环境校验**：`validate-env.ts`。
- **Stripe 配置/工具**：`stripe-smoke.mjs`、`setup-stripe-portal.ts`、`create-new-prices.ts`、`update-product-description.ts`、`sync-all-subscriptions.ts`、`sync-subscription-from-stripe.ts`、`revert-test-cancellation.ts`、`test-cancellation-webhook.ts`。
- **用户/信用**：`add-credits.ts`、`grant-pro-access.ts`。
- **通讯**：`send-newsletter.ts`、`send-test-newsletter.ts`。

## 19. 通用工具
- **`lib/utils.ts`**：`extractVideoId`、`formatDuration`、`buildVideoSlug`、`getTopicColor`、Tailwind `cn`。
- **`lib/guest-usage.ts`**：匿名访客 cookie + IP hash 跟踪。
- **`lib/safe-portal.tsx`**：SSR 安全的 React Portal。
- **`lib/suggested-question-fallback.ts`**：AI 失败时的兜底问题集。
- **`lib/mock-data.ts`**：本地开发用 mock 视频。
- **`lib/no-credits-message.ts`**：「本次免费」提示文案常量。

---

简单总结一下功能层次：**前端体验**（页面+组件+Hooks）→ **AI 编排**（ai-processing + provider 抽象）→ **数据采集**（YouTube 字幕/元数据 + 引用匹配）→ **附加能力**（翻译/导出/图像/笔记）→ **用户与计费**（Auth + 订阅 + 额度 + Stripe）→ **安全基础设施**（CSRF/限流/审计/CSP）→ **持久化**（Supabase + 迁移 + 缓存策略）。
