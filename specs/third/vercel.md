# Vercel 接入指南

> 汇总 Vercel 平台介绍、Hobby / Pro 计费模式、以及从零接入的 Demo 实操步骤。

---

## 一、Vercel 平台简介

Vercel 是 **Next.js 框架背后公司**推出的前端 / 全栈应用云平台，主打「Git 推一下就上线」的 Serverless 部署体验。

### 核心定位

把前端 + Serverless 后端 + CDN + DNS + 监控打包成一个平台，开发者只关心代码，不关心服务器。

### 核心能力

| 能力 | 说明 |
| --- | --- |
| Git 集成 | 连接 GitHub/GitLab/Bitbucket，推送即构建即部署 |
| Preview Deploy | 每个 PR 自动生成独立预览 URL |
| Serverless Functions | API 路由跑在 AWS Lambda 上，按调用计费 |
| Edge Functions / Middleware | V8 Isolate，全球边缘节点毫秒级冷启动 |
| 全球 CDN | 自动静态资源分发 + ISR 增量再生成 |
| 环境变量 | 区分 Production / Preview / Development 注入 |
| 域名 + HTTPS | 自动签发 / 续期 Let's Encrypt 证书 |
| Analytics / Speed Insights | 真实用户性能、Web Vitals、流量分析 |
| Vercel Postgres / KV / Blob | 托管数据库与对象存储（基于 Neon / Upstash / R2） |
| AI SDK / v0 | AI 应用脚手架与 UI 生成器 |

### 运行模型

```
 git push ──► Vercel Build ──► 拆分产物
                                ├─ 静态资源 ─► 全球 CDN
                                ├─ Edge 函数 ─► 边缘 V8 节点
                                └─ Node 函数 ─► Serverless Lambda
```

### 与 Next.js 的关系

Next.js 的 App Router、ISR、Server Actions、Image Optimization、Middleware 都在 Vercel 上**零配置**开箱即用 —— 这是其他平台难以完全复刻的部分（Cloudflare Pages / Netlify / 自建容器都需要不同程度妥协）。

### 适合 / 不适合场景

**适合**：
- Next.js / React / Vue / SvelteKit 等现代前端项目
- 需要 PR 预览环境的团队协作
- 全球用户、低延迟要求
- 希望避免运维 Node 服务器的初创 / 中小团队

**不适合**：
- 长连接 / WebSocket 持久化服务（Serverless 时长上限）
- 大体积二进制 / 视频处理（函数大小与执行时间限制）
- 强数据合规要求且需自控机房
- 极致成本敏感的高并发场景（按调用计费在大流量下可能比自建贵）

---

## 二、Hobby vs Pro 计费详解

> Vercel 计费政策会调整，以下为常见配额范围与结构性差异，**实际数值请以 [vercel.com/pricing](https://vercel.com/pricing) 当前页面为准**。

### 1. 总体定位

| 维度 | Hobby | Pro |
| --- | --- | --- |
| 价格 | **$0**（永久免费） | **$20 / 用户 / 月**（按席位） |
| 目标用户 | 个人、学习、Side Project、Demo | 创业团队、商业项目、初创公司 |
| 商业用途 | **禁止**（ToS 明确仅限 non-commercial） | **允许** |
| 团队协作 | 仅个人账户 | 多人 Team、角色权限 |
| SLA | 无 | 无正式 SLA（Enterprise 才有） |

**最关键的一条**：Hobby 计划禁止商业用途。如果你的项目挂了广告、收费、做客户交付、甚至是公司官网 —— 必须升级到 Pro。

### 2. 计费模型结构

Vercel 采用 **「订阅费 + 用量包含额度 + 超额按量」** 三段式：

```
   月费（席位）             每月包含额度              超额部分
 ┌─────────────┐        ┌─────────────────┐       ┌──────────────┐
 │ Hobby: $0   │   +    │ Bandwidth/Func/ │   +   │ 按 GB / 百万  │
 │ Pro: $20×N  │        │ Build/Image ... │       │ 次单价计费     │
 └─────────────┘        └─────────────────┘       └──────────────┘
```

- Hobby **不允许超额**：触顶后服务被限制 / 暂停，必须升级
- Pro 允许超额，按量计费叠加在月费之上；可设置 Spend Management 上限

### 3. 配额对比（核心资源）

| 资源 | Hobby | Pro |
| --- | --- | --- |
| **Bandwidth**（出口流量） | ~100 GB / 月 | ~1 TB / 月含，超额按 GB 计费 |
| **Serverless Function 执行** | 受限（GB-Hours 上限较低） | 大幅提升，超额按量 |
| **Edge Function 调用** | 数十万 / 月 | 数百万 / 月含 |
| **Edge Middleware 调用** | 受限 | 大幅提升 |
| **Build 时长** | ~6000 分钟 / 月 | ~24000 分钟 / 月 |
| **并发 Build** | 1 | 多个（团队共享） |
| **Image Optimization** | 数千张 / 月 | 数万张 / 月 |
| **ISR / Data Cache** | 较小额度 | 大幅提升 |
| **Function Region** | 单区域 | 可选多区域 |
| **Function 最大时长** | 短（默认 ~10s，Edge 25s） | 更长（Pro 可至 ~60–300s 视类型） |
| **Function 内存上限** | 较低 | 更高（可调） |
| **日志保留** | 短（数小时） | 较长（约 1 天，Enterprise 更长） |

### 4. 团队与协作能力

| 能力 | Hobby | Pro |
| --- | --- | --- |
| Team / 多成员 | ❌ | ✅ |
| 成员角色（Owner / Member / Viewer） | ❌ | ✅ |
| 共享环境变量 | ❌ | ✅ |
| 受保护分支 / 部署审批 | 受限 | ✅ |
| Audit Log | ❌ | ✅ |
| Password Protection（部署口令保护） | ❌ | ✅（Preview） |
| **SSO / SAML** | ❌ | ❌（仅 Enterprise） |

### 5. 域名与流量

| 能力 | Hobby | Pro |
| --- | --- | --- |
| 自定义域名数量 | 有限（约 50） | 显著放宽 |
| 自动 HTTPS（Let's Encrypt） | ✅ | ✅ |
| Wildcard 子域 | 受限 | ✅ |
| 高级防护（Vercel Firewall / WAF） | 基础 | 更全（Pro 起含 WAF 规则配置） |
| DDoS 缓解 | 基础 | 更高优先级 |

### 6. 函数 / 运行时差异

| 项 | Hobby | Pro |
| --- | --- | --- |
| Node Serverless Function 默认时长 | ~10 秒 | ~15 秒（可配到 ~300 秒） |
| Edge Function 时长 | ~25 秒 CPU | ~25 秒 CPU |
| Memory | 1024 MB | 可调至 ~3008 MB |
| Cron Jobs | 受限（数量少 / 频率低） | 更多 cron 槽位 |
| Background Functions / Fluid Compute | 受限 | 完整支持 |

> 对 LongCut 这类需要调用 AI Provider 的项目，**生成 highlight reels 等长链路请求很容易超过 Hobby 的 10s 限制**，这是从 Hobby 升级到 Pro 的最常见触发点之一。

### 7. 数据与存储产品

Vercel Marketplace（Postgres / KV / Blob / Edge Config）独立计费，但订阅层级影响赠送额度：

| 产品 | Hobby | Pro |
| --- | --- | --- |
| Vercel Postgres | 小额度免费层 | 更大免费额度 + 按量 |
| Vercel KV (Redis) | 小额度 | 更大额度 |
| Vercel Blob | 小额度 | 更大额度 |
| Edge Config | 基础 | 大幅提升读写额度 |

### 8. 可观测性

| 能力 | Hobby | Pro |
| --- | --- | --- |
| Web Analytics（基础 PV/UV） | 基础 | ✅ 更长保留 |
| Speed Insights（Web Vitals） | 受限 | ✅ |
| Function Logs | 实时但保留短 | 实时 + 较长保留 |
| Log Drains（推送到第三方） | ❌ | ✅ |
| Monitoring / Alerts | ❌ | 部分（Pro 起） |

### 9. Pro 「$20/人/月」中的「人」

「人」= **Vercel Team 中的成员席位（seat）**，per-seat 计费。

```
  Vercel Pro Team
  ┌─────────────────────────────────────────┐
  │  Owner   (Alice)   ← 1 个席位 = $20    │
  │  Member  (Bob)     ← 1 个席位 = $20    │
  │  Member  (Carol)   ← 1 个席位 = $20    │
  └─────────────────────────────────────────┘
       3 人 × $20 = $60 / 月（基础订阅费）
       + 超额用量（带宽 / 函数 / 构建...）
```

**计费的「人」**：
| 角色 | 是否计费 |
| --- | --- |
| Owner（团队所有者） | ✅ 计费 |
| Member（普通成员，可部署 / 改设置） | ✅ 计费 |
| Developer / Billing 等付费角色 | ✅ 计费 |
| Viewer / Guest（只读） | 通常 ❌ 不计费 |
| 仅在 GitHub 提交代码但不在 Team 里的 contributor | ❌ 不计费 |

**关键澄清**：
1. 不是按项目数计费 —— 一个 Team 里可以有任意多个 Project
2. 不是按部署次数计费
3. 不是按最终用户计费 —— 你的网站访客不是「人」
4. 个人 Pro = 1 个席位 = $20/月
5. 加人即时按比例计费（pro-rated），减人到下个账期生效
6. 年付通常有折扣（约 8 折，相当于 $16/人/月）

### 10. 终端用户（你网站的访客 / 注册用户）不算席位

Vercel 的 $20/人/月 收的是**开发侧**的人，不是**消费侧**的人。

```
                  ┌─────────────────────────────┐
                  │     Vercel Pro Team         │
                  │  （计算 $20/人/月 的人）   │
                  │                             │
                  │  Owner  / Member / Dev      │
                  │  ↑ 能登录 Vercel Dashboard  │
                  │    部署、改环境变量、看日志 │
                  └──────────────┬──────────────┘
                                 │ 部署
                                 ▼
                  ┌─────────────────────────────┐
                  │   你的网站 (longcut.com)    │
                  └──────────────┬──────────────┘
                                 │ 访问
                                 ▼
                  ┌─────────────────────────────┐
                  │   终端用户 (无限多个)       │
                  │   ✗ 不计入 Vercel 席位      │
                  │   ✗ 注册/登录你的网站      │
                  │     不会让你交更多 Vercel 费│
                  └─────────────────────────────┘
```

终端用户通过**用量**（不是席位）影响账单：

| 用户行为 | Vercel 侧消耗 | 计费方式 |
| --- | --- | --- |
| 打开你的网站 | Bandwidth（出口流量） | 超出包含额度后按 GB |
| 触发 API 路由 | Serverless / Edge Function 调用 | 超额按调用次数 / GB-Hours |
| 加载图片 | Image Optimization | 超额按张数 |
| 命中 ISR 缓存 | Data Cache 读写 | 超额按次数 |
| 触发 Middleware | Edge Middleware 调用 | 超额按次数 |

> **终端用户不收席位费，但他们的访问会消耗你的「用量额度」，超出额度部分按量计费。**

### 11. 适用判断流程

```
                 ┌────────────────────────────┐
                 │   你要部署什么项目？        │
                 └──────────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        个人玩具/Demo      创业 / 商用       企业 / 合规
              │                 │                 │
              ▼                 ▼                 ▼
           Hobby             Pro $20         Enterprise
        ($0, 非商用)       (商用 OK,          (SLA, SSO,
                            团队协作)         私有 Region)

         触发升级到 Pro 的常见信号：
         ├─ 函数执行 >10 秒（AI / 长任务）
         ├─ 月流量 >100 GB
         ├─ 需要团队多人协作
         ├─ 需要 Preview 口令保护
         ├─ 需要更多 Cron / Build 并发
         └─ 项目对外收费 / 客户交付
```

---

## 三、接入 Vercel Demo 实操（Hobby 计费模式）

> 目标：用一个最小 Next.js Demo，从零跑通 **GitHub → Vercel → 公网访问** 的完整流程，全程使用 Hobby 免费档。

### 1. 前置条件

| 工具 | 要求 |
| --- | --- |
| Node.js | ≥ 18.18（推荐 20.x） |
| Git | 任意近期版本 |
| GitHub 账号 | 用于托管代码 + OAuth 登录 Vercel |
| 浏览器 | 用于访问 [vercel.com](https://vercel.com) |
| 可选：Vercel CLI | `npm i -g vercel` |

### 2. 整体流程总览

```
 ① 注册 Vercel ──► ② 本地创建 Demo ──► ③ 推到 GitHub
                                              │
                                              ▼
 ⑦ 公网访问 ◄── ⑥ 自动部署 ◄── ⑤ 配置 ENV ◄── ④ Import 到 Vercel
       │
       └─► ⑧ 修改代码 → push → Preview / Production 自动更新
```

### 3. 步骤一：注册 Vercel（Hobby）

1. 浏览器打开 https://vercel.com/signup
2. 选择 **Continue with GitHub**（推荐，后续 Import 仓库免授权）
3. 授权 Vercel 访问 GitHub 后，进入 Onboarding：
   - 团队名：填个人名字即可（Hobby 是个人 scope）
   - **Plan：选 Hobby（Free）**
4. 完成后进入 Dashboard，URL 形如 `https://vercel.com/<你的用户名>`

```
 GitHub OAuth ──► Vercel Dashboard
                  ┌────────────────────┐
                  │  Personal Account  │  ← Hobby 在这里
                  │  (Free, 非商用)    │
                  └────────────────────┘
```

### 4. 步骤二：本地创建 Demo 项目

用官方脚手架创建一个最小 Next.js 15 应用：

```bash
npx create-next-app@latest vercel-demo \
  --typescript \
  --app \
  --tailwind \
  --eslint \
  --src-dir=false \
  --import-alias="@/*" \
  --use-npm

cd vercel-demo
npm run dev   # 本地访问 http://localhost:3000 验证
```

为了演示「环境变量 + Serverless 函数」两个 Vercel 核心特性，加一个简单的 API 路由。

**新建 `app/api/hello/route.ts`**：

```ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    message: 'Hello from Vercel Serverless Function',
    greeting: process.env.GREETING ?? 'default-greeting',
    region: process.env.VERCEL_REGION ?? 'local',
    deployedAt: new Date().toISOString(),
  });
}
```

**修改 `app/page.tsx`**，加一个调用按钮（可选）：

```tsx
'use client';
import { useState } from 'react';

export default function Home() {
  const [data, setData] = useState<string>('');
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Vercel Demo</h1>
      <button
        className="px-4 py-2 bg-black text-white rounded"
        onClick={async () => {
          const res = await fetch('/api/hello');
          setData(JSON.stringify(await res.json(), null, 2));
        }}
      >
        Call /api/hello
      </button>
      <pre className="bg-gray-100 p-4 rounded">{data}</pre>
    </main>
  );
}
```

**新建 `.env.local`**（仅本地用，不提交）：

```
GREETING=hello-from-local
```

`.gitignore` 默认已包含 `.env*`，确认无误即可。

### 5. 步骤三：推送到 GitHub

```bash
git init
git add .
git commit -m "init: vercel demo"

# 在 GitHub 上新建空仓库 vercel-demo（不要加 README）
git remote add origin git@github.com:<你的用户名>/vercel-demo.git
git branch -M main
git push -u origin main
```

### 6. 步骤四：在 Vercel 上 Import 项目

1. 进入 Vercel Dashboard → 右上角 **Add New… → Project**
2. 选择 GitHub 仓库 `vercel-demo` → **Import**
3. 配置页（绝大多数留默认）：

```
 ┌─────────────────────────────────────────────────┐
 │ Project Name:        vercel-demo                │
 │ Framework Preset:    Next.js  (自动识别)        │
 │ Root Directory:      ./                         │
 │ Build Command:       next build  (默认)         │
 │ Output Directory:    .next       (默认)         │
 │ Install Command:     npm install (默认)         │
 │ Node.js Version:     20.x        (Settings 改) │
 │                                                 │
 │ Environment Variables                           │
 │   GREETING = hello-from-vercel  [Add]           │
 └─────────────────────────────────────────────────┘
                         │
                         ▼
                   [ Deploy ]
```

4. 点 **Deploy**，等待 ~1–2 分钟

```
 [ Building ]  ──►  [ Uploading ]  ──►  [ Ready ✓ ]
   npm install         打包产物          分配域名
   next build          上传到 CDN        https://vercel-demo-xxx.vercel.app
```

### 7. 步骤五：访问与验证

部署完成后 Vercel 会给两个域名：

- **Production**：`https://vercel-demo-<hash>.vercel.app`（每次 main 推送更新）
- **Project 主域名**：`https://vercel-demo.vercel.app`（指向最新生产）

验证：

```bash
curl https://vercel-demo.vercel.app/api/hello
# 应返回:
# {
#   "message": "Hello from Vercel Serverless Function",
#   "greeting": "hello-from-vercel",
#   "region": "iad1",
#   "deployedAt": "..."
# }
```

如果 `greeting` 显示为 `hello-from-vercel`，说明环境变量注入成功。

### 8. 步骤六：体验 Preview Deploy（核心功能）

```bash
git checkout -b feature/change-greeting
# 修改 app/page.tsx 的标题为 "Vercel Demo (Preview)"
git commit -am "tweak: title"
git push -u origin feature/change-greeting
```

然后到 GitHub 开 PR：

```
 ┌────────────────────────────────────────────────┐
 │ GitHub PR #1                                   │
 │ ✓ Vercel — Preview deployment ready            │
 │   https://vercel-demo-git-feature-change-...   │
 │           .vercel.app                          │
 └────────────────────────────────────────────────┘
```

每个分支 / PR 都会自动获得独立 URL，不影响生产。**这是 Vercel 最值的能力之一，Hobby 也免费。**

### 9. 步骤七：使用 Vercel CLI（可选但推荐）

```bash
npm i -g vercel
vercel login                 # 浏览器扫码登录
vercel link                  # 关联当前目录到 Vercel 项目
vercel env pull .env.local   # 把云端环境变量拉到本地
vercel dev                   # 本地模拟 Vercel 运行时（含 Edge）
vercel                       # 部署到 Preview
vercel --prod                # 部署到 Production
vercel logs <url>            # 查看函数日志
```

```
   本地代码  ──vercel──►  Preview URL
            ──vercel --prod──►  Production URL
```

### 10. Hobby 档关键限制提醒

部署成功后，记住这些限制以免踩坑：

| 限制 | 量级 | 触顶后果 |
| --- | --- | --- |
| 商业用途 | **禁止** | 违反 ToS，可能被关停 |
| Bandwidth | ~100 GB/月 | 触顶限流 |
| Serverless 执行 | 较低 GB-Hours | 触顶 503 |
| Function 最大时长 | ~10 秒（Node） | 长任务直接超时 |
| Build 时长 | ~6000 分钟/月 | 触顶无法构建 |
| 并发 Build | 1 | 多次 push 排队 |
| Cron Jobs | 数量受限 | 仅 daily 频率 |
| Team 成员 | 仅个人 | 无法协作 |
| 部署密码保护 | ❌ | Preview 全公开 |

```
   Hobby 适合：           需要升级 Pro 的信号：
   ─────────────         ───────────────────────
   • 个人 Side Project   • 项目要赚钱 / 客户交付
   • 学习 / Demo         • API 调用 > 10 秒
   • 简历作品集          • 月流量 > 100 GB
   • 开源文档站          • 多人协作
                        • Preview 需要口令保护
```

### 11. 后续常见操作速查

| 需求 | 操作 |
| --- | --- |
| 绑定自定义域名 | Project → Settings → Domains → Add |
| 修改环境变量 | Project → Settings → Environment Variables |
| 区分 Production/Preview/Development 变量 | Add 时勾选对应 scope |
| 回滚部署 | Deployments 列表 → 选历史版本 → Promote |
| 看实时日志 | Project → Logs（或 `vercel logs <url>`） |
| 删除项目 | Settings → Advanced → Delete Project |
| 升级 Pro | Settings → Billing → Upgrade |

---

## 四、一句话总结

- **平台**：Vercel = Next.js 的「亲妈级」托管平台，Git 推一下就上线
- **Hobby**：$0、非商用、单人、低额度、函数 ≤10s，适合 Demo / Side Project
- **Pro**：$20/席位/月，按 Team 成员计费，访客不算；商用 OK、长函数、多人协作
- **接入三步走**：① GitHub OAuth 注册 → ② `create-next-app` 推到 GitHub → ③ Vercel Dashboard `Import Project` 一键 Deploy；之后每次 `git push` 自动出 Preview / Production URL
