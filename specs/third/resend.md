# Resend 接入指南

> 汇总 Resend 平台介绍、Free / Pro / Scale 计费模式、以及在 `vercel-demo` 项目之上从零接入 Resend 发邮件的 Demo 实操步骤。
>
> 本文档配合 [vercel.md](./vercel.md) 阅读：Vercel 负责 Next.js 部署，Resend 负责事务性邮件 + 营销邮件发送。可与 [supabase.md](./supabase.md) 并行使用——Supabase Auth 注册成功后调用 Resend 发欢迎邮件。

---

## 一、Resend 平台简介

Resend 是 **2023 年由 React Email 团队推出的现代化邮件 API 服务**，对标 Postmark / SendGrid，主打「为开发者设计的邮件平台」——以 React 组件写邮件、SDK 极简、与 Next.js / Vercel 生态深度集成。

### 核心定位

> **「邮件版的 Stripe」**：开发者只关心一行 `resend.emails.send(...)`，剩下的送达率、退信处理、信誉维护、Webhook、模板都由平台兜底。

### 核心能力

| 能力 | 说明 | 本 demo 是否覆盖 |
| --- | --- | --- |
| **Emails API** | 单封 / 批量发送的 REST API + 官方多语言 SDK | ✅ |
| **React Email 模板** | 直接传 React 组件作为邮件正文，SDK 内部渲染 HTML | ✅ |
| **Domains** | 接入自有域名（DKIM / SPF / DMARC 自动校验） | ✅ |
| **Audiences / Contacts** | 联系人列表管理，支持 segments 与订阅状态 | 🔵 简介 |
| **Broadcasts** | 营销活动一次性群发（基于 Audiences） | 🔵 简介 |
| **Webhooks** | bounce / delivered / opened / clicked / complained 事件回调 | 🔵 简介 |
| **Idempotency Key** | 客户端去重，避免重试重复发送 | 🔵 简介 |
| **Batch API** | 一次调用最多发 100 封 | ✅ |
| **Scheduled Send** | `scheduledAt` 参数支持未来时间发送 | 🔵 简介 |
| **Logs / Events** | 控制台查看每封邮件状态、原文、点击轨迹 | ✅ |
| **Multi-Region** | 美/欧节点（合规要求场景） | ❌ 不演示 |
| **Dedicated IP** | 专用发送 IP（高量场景） | ❌ 不演示 |

### 运行模型

```
   你的应用 ──► Resend SDK ──► Resend API
                                  │
                                  ▼
                ┌──────────────────────────────────┐
                │  渲染 React Email → HTML         │
                │  签名 DKIM / 注入 SPF            │
                │  路由到 SMTP 出口（共享/专用 IP）│
                │  追踪打开 / 点击                 │
                └─────────────┬────────────────────┘
                              ▼
                       收件人邮箱
                              │
                              ▼
       Webhook ◄── 事件回调（delivered/bounced/opened/clicked）
```

关键点：**邮件正文以 React 组件形式定义**，无需手写 HTML 字符串拼接；React Email 提供 `<Button>` `<Heading>` `<Section>` 等跨邮件客户端兼容的原语。

### 与同类产品的关系

| 维度 | Resend | Postmark | SendGrid | AWS SES |
| --- | --- | --- | --- | --- |
| 历史 | 2023 起 | 2010 起，业界标杆 | 老牌大厂（Twilio 子品牌） | AWS 原生 |
| DX（开发者体验） | **极简、TS 一等公民** | 传统稳定 | 笨重 | 原始（自己拼模板） |
| React Email 集成 | ✅ 原生 | ❌ 自行整合 | ❌ | ❌ |
| 价格（5 万封/月） | $20 | $50 | $20 起 | ~$5 |
| 事务/营销分流 | 支持但不强制 | **强制 stream 隔离** | 支持 | 自行设计 |
| 送达率口碑 | 好（年轻） | 业内最强之一 | 一般 | 取决于自己运营 |
| Vercel/Next 集成 | **官方深度合作** | 良好 | 一般 | 一般 |

**何时选 Resend？** 项目用 Next.js + React + Vercel；想用 React 写邮件模板；早期/中期项目，量级在百万级以下；看重 DX 和成本。

**何时选 Postmark？** 历史业务、对送达率有极致追求、需要事务/营销强隔离的金融/医疗类应用。

### 适合 / 不适合场景

**适合**：
- Next.js / React 全栈项目，想复用组件技术栈写邮件
- 创业 / SaaS / 工具类产品，发送量百万级以下
- 需要高速接入、文档清晰、控制台现代化
- 与 Vercel / Supabase / Clerk 等现代工具配合

**不适合**：
- 对长历史送达率口碑有刚需的金融/医疗
- 高度自研的邮件平台（自己有 SMTP / IP warm-up 团队）
- 极致成本场景（裸用 AWS SES 单价更低）
- 需要专用 Region 部署（Resend 仅美/欧）

---

## 二、Free vs Pro vs Scale 计费详解

> Resend 计费政策可能调整，以下为常见结构性差异，**实际数值请以 [resend.com/pricing](https://resend.com/pricing) 当前页面为准**。

### 1. 总体定位

| 维度 | Free | Pro | Scale |
| --- | --- | --- | --- |
| 价格 | **$0** | **$20 / 月起** | **$90 / 月起** |
| 月发送量包含 | 3,000 封（**100 封/天上限**） | 50,000 封 | 100,000 封起（按档加价） |
| 域名数 | 1 | 10 | 10+ |
| 团队成员 | 1 | 不限 | 不限 |
| 日志保留 | 1 天 | 3 天 | 7 天 |
| 商业用途 | 允许（不强制限制非商用，区别于 Vercel Hobby） | 允许 | 允许 |
| 支持渠道 | 社区 / 文档 | Email | Priority Email |

### 2. 计费模型结构

Resend 采用 **「订阅费 + 发送量阶梯包」** 而非 per-email 单价。超量自动按下一档计费。

```
   月费                包含发送量              超额
 ┌──────────┐       ┌─────────────────┐    ┌─────────────────┐
 │ Free $0  │   +   │ 3K（100/天）     │ +  │ 升级才能继续发  │
 │ Pro $20  │       │ 50K              │    │ 自动跳到 100K  │
 │ Scale    │       │ 100K / 250K /... │    │ 档（$90 起）   │
 └──────────┘       └─────────────────┘    └─────────────────┘
```

**关键差异（vs Vercel）**：
- Free 档**允许商用**，没有 ToS 限制
- Free 档有**每日 100 封硬上限**，避免被滥用做垃圾邮件
- 升档不是按 seat，而是按发送量档位

### 3. 配额对比（核心资源）

| 资源 | Free | Pro ($20) | Scale ($90 起) |
| --- | --- | --- | --- |
| 月发送量 | 3,000 | 50,000 | 100,000+ |
| 每日上限 | 100 封 | 无 | 无 |
| 域名验证数 | 1 | 10 | 10+ |
| Audiences（受众列表） | 1 | 10 | 不限 |
| Contacts 总数 | 1,000 | 10,000 | 不限 |
| Broadcasts/月 | 100 封容量内 | 不限发送（按总量） | 不限 |
| Webhooks endpoint | 1 | 10 | 不限 |
| 日志保留 | 1 天 | 3 天 | 7 天 |
| Send Logs 详情 | 仅最近 | 完整 | 完整 + 导出 |
| API Rate Limit | 2 req/s | 10 req/s | 提升至 100 req/s |
| Batch API | ✅ | ✅ | ✅ |
| Idempotency Key | ✅ | ✅ | ✅ |
| Dedicated IP | ❌ | ❌ | 可加购（$30/月起） |
| Multi-Region（EU） | ❌ | ❌ | ✅ |
| 团队 SSO | ❌ | ❌ | ❌（Enterprise 才有） |

### 4. 触发升级的常见信号

```
                Free → Pro                    Pro → Scale
   ┌─────────────────────────────┐    ┌──────────────────────────┐
   │ • 月发送 > 3,000 封          │    │ • 月发送 > 50,000 封      │
   │ • 日发送峰值 > 100 封         │    │ • 需要更长日志保留        │
   │ • 需要多个域名（产品 +官网）  │    │ • API 速率被限流          │
   │ • 需要团队多人协作            │    │ • 需要 EU Region 合规     │
   │ • Audiences/Contacts 超限     │    │ • 需要专用 IP             │
   └─────────────────────────────┘    └──────────────────────────┘
```

### 5. 终端用户（你的网站访客）不算席位

与 Vercel Pro 相同——Resend 不按你的 SaaS 终端用户数计费，而是按**实际发送的邮件数**计费。

```
                  ┌─────────────────────────────┐
                  │     Resend Account          │
                  │  （订阅档位决定月度上限）   │
                  │                             │
                  │  Owner / Member / Dev       │
                  │  ↑ 能登录控制台、改 API Key │
                  └──────────────┬──────────────┘
                                 │ 调 API
                                 ▼
                  ┌─────────────────────────────┐
                  │  你的应用 (Next.js)         │
                  │  resend.emails.send(...)    │
                  └──────────────┬──────────────┘
                                 │ 发邮件
                                 ▼
                  ┌─────────────────────────────┐
                  │  终端用户邮箱（无限多个）   │
                  │  ✗ 不计入 Resend 席位       │
                  │  ✓ 每发 1 封消耗 1 配额     │
                  └─────────────────────────────┘
```

### 6. 适用判断流程

```
                ┌────────────────────────────┐
                │   你要发什么邮件？          │
                └──────────────┬─────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
        Demo / 验证        创业 / SaaS         规模化运营
            │                  │                  │
            ▼                  ▼                  ▼
         Free              Pro $20           Scale $90+
      (3K 封, 100/天)    (50K 封, 多域名)   (100K+, 多区域)
                                                  │
                                                  ▼
                                          Enterprise
                                       （SSO/SLA/专用基建）
```

---

## 三、在 vercel-demo 上接入 Resend Demo 实操（Free 计费模式）

> 目标：在 [vercel.md](./vercel.md) 已部署的 `vercel-demo` 项目基础上，加一条 **「点击按钮 → 调用 /api/email/send → Resend 发邮件」** 的最小链路，全程使用 Free 免费档。

### 1. 前置条件

| 条件 | 要求 |
| --- | --- |
| 已完成 [vercel.md](./vercel.md) Demo | `vercel-demo` 项目已能跑通 |
| 一个真实邮箱 | 用于注册 Resend 账号 + 收测试邮件 |
| 一个域名（可选但推荐） | 用于自定义发件域，否则只能用沙箱地址发给自己 |
| Node.js | ≥ 18.18 |

### 2. 整体流程总览

```
 ① 注册 Resend ──► ② 验证发送域 ──► ③ 创建 API Key
                                          │
                                          ▼
 ⑦ 收到邮件 ◄── ⑥ Vercel 部署 ◄── ⑤ 写 API + 模板 ◄── ④ 装 SDK
       │
       └─► ⑧ 控制台看 Logs / Events
```

### 3. 步骤一：注册 Resend（Free）

1. 浏览器打开 https://resend.com/signup
2. 选择 **Continue with GitHub**（推荐，与 Vercel 同账号体系）
3. 填写 Workspace 名（如个人名字），自动进入 Free 档
4. 进入 Dashboard，左侧菜单结构：

```
 Resend Dashboard
 ├─ Overview           # 月度发送统计
 ├─ Emails             # 单封邮件日志
 ├─ Domains            # 发送域管理
 ├─ Audiences          # 联系人列表
 ├─ Broadcasts         # 群发活动
 ├─ Webhooks           # 事件回调
 ├─ API Keys           # 密钥管理
 └─ Settings / Billing
```

### 4. 步骤二：验证发送域

> Free 档提供一个沙箱地址 `onboarding@resend.dev`，**只能发给你的注册邮箱**，用于初期测试。生产场景必须验证自有域名。

#### 4.1 沙箱模式（最快上手）

跳过本步骤，直接用 `onboarding@resend.dev` 作为 `from`，仅能发到你的注册邮箱（用于本 Demo 完全够用）。

#### 4.2 自有域名验证（推荐）

1. Dashboard → **Domains → Add Domain**
2. 输入域名（例如 `example.com` 或子域 `mail.example.com`，**推荐用子域**避免污染主域信誉）
3. Resend 生成 4 条 DNS 记录：

```
 类型    名称                          值
 ──────  ────────────────────────────  ───────────────────────────────────
 MX      send.mail.example.com         feedback-smtp.us-east-1.amazonses.com
 TXT     send.mail.example.com         "v=spf1 include:amazonses.com ~all"
 TXT     resend._domainkey.mail        p=MIGfMA0GCS... （DKIM 公钥）
 TXT     _dmarc.mail.example.com       "v=DMARC1; p=none;"
```

4. 在你的 DNS 提供商（Cloudflare / Namecheap / Vercel DNS）添加上述记录
5. 回 Resend Dashboard 点 **Verify DNS Records**，几分钟后状态变 ✅ **Verified**

```
   未验证                    验证中                    已验证
 ┌──────────┐  添加 DNS  ┌──────────┐  传播完成  ┌──────────┐
 │ Pending  │ ────────► │ Verifying│ ────────► │ Verified │
 └──────────┘           └──────────┘           └──────────┘
```

### 5. 步骤三：创建 API Key

1. Dashboard → **API Keys → Create API Key**
2. 配置：
   - **Name**：`vercel-demo`
   - **Permission**：选 `Sending access`（最小权限）
   - **Domain**：选刚验证的域名（或 `All Domains`）
3. 点 **Add**，**立即复制 Key**（形如 `re_xxxxxxxxxxxxxxxxxxxxxxx`，仅展示一次）

```
 ⚠️  Key 只显示一次，关闭弹窗后无法再查看，必须重建。
```

### 6. 步骤四：本地装 SDK

进入 `vercel-demo` 目录：

```bash
cd vercel-demo
npm install resend
npm install @react-email/components @react-email/render
```

| 包 | 用途 |
| --- | --- |
| `resend` | 官方 SDK，封装 REST API |
| `@react-email/components` | `<Button>` `<Heading>` 等邮件兼容组件 |
| `@react-email/render` | 把 React 组件渲染成 HTML 字符串（SDK 内部也会调） |

### 7. 步骤五：写邮件模板（React Email）

**新建 `emails/welcome.tsx`**（注意：`emails/` 目录在项目根，与 `app/` 平级）：

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface WelcomeEmailProps {
  name: string;
}

export default function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to vercel-demo, {name}!</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f6f9fc' }}>
        <Container style={{ maxWidth: 600, padding: 32, backgroundColor: '#fff' }}>
          <Heading style={{ fontSize: 24, color: '#111' }}>
            Hi {name}, welcome 👋
          </Heading>
          <Text style={{ fontSize: 16, color: '#444', lineHeight: 1.6 }}>
            Thanks for trying out the <strong>vercel-demo</strong>. This email
            was sent from a Next.js Serverless Function via Resend.
          </Text>
          <Section style={{ marginTop: 24 }}>
            <Button
              href="https://vercel-demo.vercel.app"
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              Open the Demo
            </Button>
          </Section>
          <Text style={{ fontSize: 12, color: '#999', marginTop: 32 }}>
            Sent via Resend · vercel-demo
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### 8. 步骤六：写 API 路由

**新建 `app/api/email/send/route.ts`**：

```ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import WelcomeEmail from '@/emails/welcome';

export const runtime = 'nodejs';

const resend = new Resend(process.env.RESEND_API_KEY);

const requestSchema = z.object({
  to: z.string().email(),
  name: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { to, name } = parsed.data;

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
    to,
    subject: `Welcome, ${name}!`,
    react: WelcomeEmail({ name }),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ id: data?.id, ok: true });
}
```

> 同时 `npm install zod` 装一下校验库。

### 9. 步骤七：在前端加触发按钮

**修改 `app/page.tsx`**：

```tsx
'use client';
import { useState } from 'react';

export default function Home() {
  const [to, setTo] = useState('');
  const [name, setName] = useState('Friend');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    setLoading(true);
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, name }),
    });
    setResult(JSON.stringify(await res.json(), null, 2));
    setLoading(false);
  };

  return (
    <main className="p-8 space-y-4 max-w-lg">
      <h1 className="text-2xl font-bold">Vercel Demo + Resend</h1>
      <input
        className="border p-2 w-full rounded"
        placeholder="recipient@example.com"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <input
        className="border p-2 w-full rounded"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        disabled={loading || !to}
        onClick={send}
      >
        {loading ? 'Sending…' : 'Send welcome email'}
      </button>
      <pre className="bg-gray-100 p-4 rounded text-sm">{result}</pre>
    </main>
  );
}
```

### 10. 步骤八：本地配置环境变量并测试

**编辑 `.env.local`**：

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM=onboarding@resend.dev    # 沙箱模式
# RESEND_FROM=hello@mail.example.com # 验证域后改成自己的
```

```bash
npm run dev
# 浏览器打开 http://localhost:3000
# 填入「你注册 Resend 用的邮箱」+ 任意 name → 点按钮
```

预期看到响应：

```json
{ "id": "f3a1b2c0-...-...", "ok": true }
```

去对应邮箱收件箱（注意检查 Promotions / 垃圾邮件），应能看到 **Welcome, Friend!** 邮件。

```
 沙箱模式重要限制：
 ┌─────────────────────────────────────────────────────┐
 │ from: onboarding@resend.dev                         │
 │ to:   只能是「Resend 账号注册邮箱」                  │
 │ 发到其他地址会返回 403 错误                          │
 └─────────────────────────────────────────────────────┘
```

### 11. 步骤九：把环境变量同步到 Vercel

```bash
# 方式 A：CLI 一键拉/推
vercel link
vercel env add RESEND_API_KEY production
# 粘贴 Key，Enter 确认
vercel env add RESEND_FROM production
# 粘贴 onboarding@resend.dev 或自有发件地址

# 方式 B：Dashboard 手动添加
# Project → Settings → Environment Variables
#   RESEND_API_KEY = re_xxx     [Production / Preview / Development]
#   RESEND_FROM    = ...        [Production / Preview / Development]
```

> ⚠️ **API Key 必须只在 Production / Preview 设置，不要勾给 Development**——避免本地误用线上密钥；本地用 `.env.local` 就够了。

### 12. 步骤十：推送触发部署 + 公网验证

```bash
git add .
git commit -m "feat: add resend integration"
git push
```

Vercel 自动构建部署后：

```bash
# 用 curl 直接打线上接口验证
curl -X POST https://vercel-demo.vercel.app/api/email/send \
  -H "Content-Type: application/json" \
  -d '{"to":"<你的注册邮箱>","name":"Production"}'
# 期望：{ "id": "...", "ok": true }
```

打开 Resend Dashboard → **Emails**，能看到刚刚的发送记录：

```
 ┌─────────────────────────────────────────────────────────────┐
 │ ID         To                  Subject              Status  │
 ├─────────────────────────────────────────────────────────────┤
 │ f3a1b2..  you@example.com    Welcome, Production!  Delivered│
 │ e7c4d9..  you@example.com    Welcome, Friend!      Delivered│
 └─────────────────────────────────────────────────────────────┘
```

点进任一条可看：邮件原文（HTML）、headers、SMTP 投递路径、是否被打开 / 点击。

### 13. 完整数据流图

```
   ┌───────────────────────────────────────────────────────────┐
   │  浏览器 (vercel-demo.vercel.app)                          │
   │  填写 to + name → 点击按钮                                │
   └────────────────────────┬─────────────────────────────────┘
                            │ POST /api/email/send
                            ▼
   ┌───────────────────────────────────────────────────────────┐
   │  Vercel Serverless Function (Node Runtime)                │
   │  ├─ Zod 校验 to / name                                   │
   │  ├─ 用 RESEND_API_KEY 实例化 SDK                          │
   │  ├─ 把 <WelcomeEmail name={name}/> 作为 react 字段        │
   │  └─ 调用 resend.emails.send({ from, to, subject, react }) │
   └────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
   ┌───────────────────────────────────────────────────────────┐
   │  Resend API                                               │
   │  ├─ 渲染 React → HTML（@react-email/render）             │
   │  ├─ 注入 DKIM 签名 / SPF / DMARC                          │
   │  ├─ 路由到 SMTP 出口（共享 IP 池）                       │
   │  └─ 返回 { id }                                           │
   └────────────────────────┬─────────────────────────────────┘
                            │ SMTP
                            ▼
   ┌───────────────────────────────────────────────────────────┐
   │  收件人邮箱 (Gmail / Outlook / ...)                       │
   └────────────────────────┬─────────────────────────────────┘
                            │ 事件回调（如配置 Webhook）
                            ▼
   ┌───────────────────────────────────────────────────────────┐
   │  你的 /api/webhooks/resend  （可选下一步）                │
   │  delivered / bounced / opened / clicked / complained      │
   └───────────────────────────────────────────────────────────┘
```

### 14. Free 档关键限制提醒

| 限制 | 量级 | 触顶后果 |
| --- | --- | --- |
| 月发送量 | 3,000 封 | 当月超出后无法继续发送 |
| 每日上限 | 100 封 | 当天触顶被限流（`429`） |
| 沙箱发件 | `onboarding@resend.dev` 只能发给注册邮箱 | 发其他地址返回 403 |
| 域名数 | 1 个 | 无法同时验证多个域 |
| 团队成员 | 仅个人 | 无法多人协作 |
| 日志保留 | 1 天 | 排查问题需及时 |
| API Rate Limit | 2 req/s | 高并发场景需排队 |

```
   Free 适合：              需要升级 Pro 的信号：
   ──────────              ────────────────────────
   • Demo / Side Project   • 月发送 > 3K 或日发送 > 100
   • 个人通知邮件           • 需要发到任意收件人（验证域）
   • 学习 / 验证工具链      • 需要团队协作
                           • 需要更长日志排查
                           • 需要更高 API rate limit
```

### 15. 后续常见操作速查

| 需求 | 操作 |
| --- | --- |
| 验证自有域名 | Domains → Add Domain → 配置 4 条 DNS |
| 切换沙箱/正式发件域 | 改 `RESEND_FROM` 环境变量 |
| 查看单封邮件投递详情 | Emails → 点击行 → Events 标签 |
| 接入事件 Webhook | Webhooks → Add Endpoint → 写 `/api/webhooks/resend` 路由 |
| 批量发送（100 封内） | `resend.batch.send([...])` |
| 定时发送 | `resend.emails.send({ scheduledAt: '2026-05-01T09:00:00Z', ... })` |
| 防止重试重复发 | 请求加 `headers: { 'Idempotency-Key': '<uuid>' }` |
| 维护订阅状态 | Audiences + Contacts API；或自建 `unsubscribed` 字段 |
| 升级 Pro | Settings → Billing → Upgrade |

### 16. 与 Supabase 联动（进阶预告）

如果同时接入了 [supabase.md](./supabase.md) 的 Auth 体系，可以在用户注册后自动发欢迎邮件：

```ts
// app/api/auth/callback/route.ts 中（或 Supabase Database Trigger + pg_net）
const { data: user } = await supabase.auth.getUser();
if (user?.user) {
  await fetch('/api/email/send', {
    method: 'POST',
    body: JSON.stringify({ to: user.user.email, name: user.user.user_metadata.name }),
  });
}
```

更进阶的做法：用 Supabase **`pg_cron + pg_net`** 实现「注册 5 分钟后异步发欢迎邮件」的可重试队列（参考 longcut 项目的 `pending_welcome_emails` 表设计）。

---

## 四、一句话总结

- **平台**：Resend = 为开发者设计的现代邮件 API，React 写模板，与 Next.js / Vercel 深度集成
- **Free**：$0、3K 封/月、100 封/天、沙箱发件、单域、商用 OK，适合 Demo 和小型工具
- **Pro**：$20/月、50K 封、10 域名、团队协作、3 天日志，是绝大多数 SaaS 的起点
- **Scale**：$90/月起、100K+、多区域、Dedicated IP 可加购，规模化运营起跳
- **接入三步走**：① 注册 Resend → ② 创建 API Key（沙箱可跳过域名验证）→ ③ `npm install resend` 后写 `app/api/email/send/route.ts`，把 React Email 组件作为 `react` 字段传入 SDK 即可；环境变量 `RESEND_API_KEY` + `RESEND_FROM` 同步到 Vercel，`git push` 后自动生效
