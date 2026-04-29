# Lemon Squeezy 接入指南

> 汇总 Lemon Squeezy 平台介绍、计费模式、以及在 `vercel-demo` 项目之上从零接入「订阅 + 一次性付费」收款链路的 Demo 实操步骤。
>
> 本文档配合 [vercel.md](./vercel.md) 阅读：Vercel 负责 Next.js 部署，Lemon Squeezy 作为 **MoR（Merchant of Record）** 全权负责收款 / 开票 / 全球税务。可与 [supabase.md](./supabase.md) 并行使用——Supabase 存用户、Lemon Squeezy webhook 写入订阅状态。

---

## 一、Lemon Squeezy 平台简介

Lemon Squeezy 是 **2021 年成立、2024 年被 Stripe 收购** 的现代化 MoR 收款平台，主打「为独立开发者设计的全球收款 + 税务合规一站式方案」——开发者只关心产品，平台代收款、代开票、代缴 VAT/GST/Sales Tax。

### 核心定位

> **「为独立开发者把 Stripe + Quaderno + Paddle 缝合在一起」**

它不是 Stripe 的竞品，而是 **Stripe 之上的 MoR 抽象**：你不和买家直接发生交易，Lemon Squeezy 是法律意义上的卖方（Merchant of Record），它代你收钱、代你给买家开发票、代你向各国税务局申报和缴税。开发者把"收款 + 合规"两件最痛的事完全外包。

### 核心能力

| 能力 | 说明 | 本 demo 是否覆盖 |
| --- | --- | --- |
| **Merchant of Record** | 平台是法律卖方，全球 VAT / GST / Sales Tax 自动代缴 | ✅ |
| **订阅（Subscriptions）** | 月 / 年 / 自定义周期、proration、试用、优惠码 | ✅ |
| **一次性付费（One-time）** | 数字商品、license、充值包 | ✅ |
| **License Keys** | 卖软件激活码内置生成 / 校验 / 撤销 API | 🔵 简介 |
| **Hosted Checkout** | 平台托管的支付页面，支持 overlay 弹层嵌入 | ✅ |
| **Customer Portal** | 用户自管订阅、发票、支付方式 | ✅ |
| **Webhooks** | order_created / subscription_* / license_* 等事件回调 | ✅ |
| **Affiliates** | 内置联盟营销系统 | 🔵 简介 |
| **Discount / 优惠码** | 限时、限量、限地区优惠码 | 🔵 简介 |
| **多币种 + 自动转换** | 200+ 国家 / 30+ 币种自动结算 | ✅ |
| **PayPal 提现** | 大陆开发者最熟悉的资金回流路径 | ✅ |
| **API + Webhook** | REST API + JSON:API 规范 | ✅ |
| **Storefront** | 自带产品展示页（可不用） | ❌ 不演示 |

### 运行模型

```
   买家                                     你（开发者）
    │                                            ▲
    │ 1. 在 Hosted Checkout 输入卡号              │
    │                                            │
    ▼                                            │
 ┌──────────────────────────────────────┐        │
 │   Lemon Squeezy（Merchant of Record） │        │
 │   ├─ 收款（Stripe 底层）              │        │
 │   ├─ 反欺诈 / 风控                    │        │
 │   ├─ 自动判定买家所在国并加 VAT/GST   │        │
 │   ├─ 给买家开本地合规发票             │        │
 │   ├─ 替你向各国税务局申报 + 缴税       │        │
 │   └─ 扣 5% + 50¢ 平台费              │ 6. 周结算
 └──────────────┬───────────────────────┘        │
                │ 2. 触发 webhook                  │
                ▼                                 │
 ┌──────────────────────────────────────┐        │
 │   你的应用（Next.js on Vercel）       │        │
 │   ├─ 校验签名 + 幂等                  │        │
 │   └─ 写库 / 解锁权限 / 发欢迎邮件     │        │
 └──────────────────────────────────────┘        │
                                                  │
                    PayPal / Wise / 银行电汇 ─────┘
```

关键点：**整套合规从开发者头上拿掉了**。如果自己接 Stripe 直收，欧盟 VAT MOSS 申报、美国各州 Sales Tax 经济关联（Economic Nexus）、英国 VAT、日本消费税……每一项都是独立的合规任务；MoR 把这些全部承接，开发者只对接 Lemon Squeezy 一家即可。

### 与同类产品的关系

| 维度 | Lemon Squeezy | Paddle | Polar.sh | Gumroad | 自接 Stripe |
| --- | --- | --- | --- | --- | --- |
| 性质 | MoR | MoR | MoR | MoR | 收单（非 MoR） |
| 抽成 | **5% + 50¢** | 5% + 50¢ | 4% + 40¢ | 10% flat | 2.9% + 30¢ |
| 月费 / 起步费 | 无 | 无 | 无 | 无 | 无 |
| 大陆主体 | ✅ 个人 / 公司均可 | ⚠️ 公司为主，审核严 | ⚠️ 需海外 Stripe 中转 | ✅ 个人 OK | ❌ 不支持大陆 |
| 提现方式 | **PayPal / Wise / 银行** | Wise / 银行（无 PayPal） | Stripe Connect | PayPal / 银行 | Stripe → 本地银行 |
| 审核速度 | 几小时–1 天 | 3 天–1 周 | 几小时 | 即时 | 视主体 |
| License Key | ✅ 内置 | ❌ 需自实现 | ✅ 内置 | ✅ 内置 | ❌ 需自实现 |
| Affiliate | ✅ 内置 | 需插件 | 部分 | ✅ 内置 | ❌ |
| 税务合规 | ✅ 全球代办 | ✅ 全球代办 | ✅ 全球代办 | ✅ 全球代办 | ❌ 自办（或 Stripe Tax 0.5%） |
| 风险 / 历史 | 中（被 Stripe 收购，背书强） | 低（10+ 年） | 中（年轻） | 低（老牌） | 低 |
| Webhook 事件 | 对独立开发者最友好 | 工程化 | 类 Stripe | 简化 | 最完整 |
| 综合推荐场景 | **大陆个人开发者首选** | B2B SaaS / 欧洲市场 | 海外开发者最低费率 | 内容创作者 | 主体在 Stripe 支持地区 |

**何时选 Lemon Squeezy？** 大陆个人开发者卖海外软件 / SaaS / 课程；想要 PayPal 提现；客单价 ≥ $5；不想搞海外公司主体。

**何时不选？** 主要做国内市场（不支持微信 / 支付宝）；月营收已 > $50k 且能搭海外主体（Polar / Stripe 直接更便宜）；卖客单价 < $5 的纯一次性商品（Gumroad 的 10% flat 反而更便宜）。

### 适合 / 不适合场景

**适合**：
- 大陆 / 海外个人开发者卖 SaaS / 工具 / 模板 / 课程
- 想跳过"注册海外公司"环节直接收美元
- 客单价 ≥ $5，月营收 < $50k
- Next.js / TypeScript 全栈项目（SDK / 文档质量在线）
- 需要 license key 卖软件激活码
- 需要 affiliate / 优惠码做增长

**不适合**：
- 主要面向中国大陆用户（不支持微信 / 支付宝）
- 客单价 < $5 的纯一次性商品（5%+50¢ 的固定费占比 > 15%）
- 已规模化（月营收 > $50k），3% 差价开始痛
- 涉及 [Restricted Items](https://www.lemonsqueezy.com/legal/acceptable-use)（成人、加密、博彩、实物、医药等）
- 需要发票上是你公司抬头（MoR 模式发票抬头永远是 Lemon Squeezy）

---

## 二、计费详解

> Lemon Squeezy 自己**没有 Free / Pro / Scale 套餐分层**，所有用户走同一套抽成模型。**实际数值请以 [lemonsqueezy.com/pricing](https://www.lemonsqueezy.com/pricing) 为准**。

### 1. 总体定位

| 维度 | Lemon Squeezy |
| --- | --- |
| 入门月费 | **$0**（无订阅费、无最低保证额） |
| 抽成 | **5% + 50¢ / 笔** |
| 货币转换费 | ~2%（用户用非主币种付款时叠加） |
| 跨境卡费 | 部分卡组织额外收（含在 5% 里，少数高风险地区会额外加） |
| KYC | 个人 / 公司均可，护照 + 地址证明 |
| 提现 | PayPal / Wise / 银行电汇（最低 $10） |
| 结算周期 | 每周五 |
| 审核 | 1–3 天 |

**关键差异（vs Vercel / Supabase / Resend）**：
- **没有按用户 / 按席位 / 按调用计费的概念**——只有"实际收到多少钱、抽多少"
- **没有用量"配额"**：发多少笔订单、收多少钱都行
- **唯一的成本是抽成**——这意味着月营收 = 0 时成本也是 0

### 2. 计费模型结构

```
   买家付款 $100 (USD 主币种)
            │
            ▼
   ┌────────────────────────────────┐
   │  Lemon Squeezy 收到 $100        │
   │                                │
   │  ─ 平台费   5% × $100 = $5.00  │
   │  ─ 固定费   $0.50               │
   │  ─ VAT/GST  代收代缴（不影响你） │
   │                                │
   │  你净到手：$94.50              │
   └────────────────────────────────┘

   买家付款 €100（欧元，非主币）
            │
            ▼
   ┌────────────────────────────────┐
   │  ─ 货币转换    ~2% × €100      │
   │  ─ 平台费 5% + $0.50 fixed     │
   │                                │
   │  你净到手：约 $93–$95          │
   └────────────────────────────────┘
```

**实际到手率经验值**：USD 收款约 **94%**；欧元 / 英镑收款约 **91–93%**；其他币种 **90–92%**。

### 3. 不同客单价的抽成占比

| 客单价 | 抽成 | 占比 | 评价 |
| --- | --- | --- | --- |
| $1.99 | $0.60 | **30%** | 💀 不要做 |
| $2.99 | $0.65 | **22%** | 不推荐 |
| $4.99 | $0.75 | **15%** | 边缘可接受 |
| $9.99 | $1.00 | **10%** | 合理 |
| $19.99 | $1.50 | 7.5% | 良好 |
| $49.99 | $3.00 | 6% | 良好 |
| $99.99 | $5.50 | 5.5% | 接近名义抽成 |

> **务实结论**：客单价 ≥ $5 才适合用 Lemon Squeezy；< $5 优先考虑 Gumroad（10% 无固定费）或合并涨价。

### 4. 不收的费用

| 项 | 收费？ |
| --- | --- |
| 月费 / 起步费 / 最低保证 | ❌ |
| 团队成员席位 | ❌（Pro 起也免费多人） |
| 域名 / 自定义品牌页 | ❌ |
| Webhook / API 调用 | ❌ |
| 订单数量上限 | ❌ |
| Customer Portal / 自助退款 | ❌ |
| Affiliate / 优惠码 | ❌ |

### 5. 触发使用其他平台的常见信号

```
    继续用 Lemon Squeezy             考虑迁移其他平台
   ┌─────────────────────────┐    ┌─────────────────────────────┐
   │ • 月营收 < $50K         │    │ • 月营收 > $50K（费率敏感） │
   │ • 主要海外用户           │    │ • 国内用户为主（要微信支付宝）│
   │ • 客单价 ≥ $5            │    │ • 客单价 < $5（迁 Gumroad）  │
   │ • 个人开发者 / 小团队    │    │ • 公司化 / 有海外主体        │
   │ • 需要 license / affiliate│    │ • B2B SaaS（迁 Paddle）     │
   └─────────────────────────┘    └─────────────────────────────┘
```

### 6. 终端用户（你的网站访客 / 注册用户）不算"成本"

与 Vercel Pro / Resend 类似——Lemon Squeezy 不按你的 SaaS 终端用户数计费，只按**实际成交订单**计费。

```
                  ┌─────────────────────────────┐
                  │  你的应用（Vercel）         │
                  │  注册用户 100 万人          │
                  │  → Lemon Squeezy 不知道     │
                  └──────────────┬──────────────┘
                                 │ 仅"成功付款"上报
                                 ▼
                  ┌─────────────────────────────┐
                  │  Lemon Squeezy              │
                  │  本月成交 800 笔 × $9.99    │
                  │  你净到手：~$7,176          │
                  │  平台扣：~$816              │
                  └─────────────────────────────┘
```

### 7. 大陆主体注册关键点

| 项 | 状态 |
| --- | --- |
| 接受大陆主体 | ✅ 个人 / 公司均可 |
| KYC 接受证件 | 中国身份证 + 护照（推荐护照） |
| 地址证明 | 任意账单（水电、银行月结单） |
| 收款货币 | 默认 USD，可设置其他主币 |
| **PayPal 提现到大陆** | ✅ 最成熟链路（5–7 天到账，~1.2% 提现费 + 强制结汇至关联中国银行卡） |
| Wise 提现 | ✅ 但 Wise 大陆个人账户有政策风险，谨慎 |
| 银行电汇到大陆 | ✅ 但 SWIFT 中间行可能扣费 $20–40，小额不划算 |
| 个人结汇额度 | 5 万美元 / 年（含从 PayPal 进账） |

> 📌 **大陆个人开发者推荐路径**：Lemon Squeezy 收款 → PayPal 美元账户 → PayPal 提现到关联国内银行卡（自动结汇为 RMB）。这是目前最稳的链路，无需任何海外公司或银行账户。

### 8. 适用判断流程

```
                ┌────────────────────────────┐
                │   你想卖什么？              │
                └──────────────┬─────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
       海外 SaaS            内容 / 模板         国内市场
       客单价 ≥ $5          客单价 < $5          微信 / 支付宝
            │                  │                  │
            ▼                  ▼                  ▼
     Lemon Squeezy ✅     Gumroad（10% flat）  自接微信支付宝
                                                  │ 需大陆主体
                                                  │ 否则用
                                                  ▼
                                             DodoPayments
```

---

## 三、在 vercel-demo 上接入 Lemon Squeezy Demo 实操

> 目标：在 [vercel.md](./vercel.md) 已部署的 `vercel-demo` 项目基础上，加一条 **「点击 Subscribe / Buy Top-up → Hosted Checkout → Webhook 解锁权限」** 的最小链路，跑通**订阅 + 一次性付费**两种核心计费场景。

### 1. 前置条件

| 条件 | 要求 |
| --- | --- |
| 已完成 [vercel.md](./vercel.md) Demo | `vercel-demo` 项目能跑通 |
| Lemon Squeezy 账号 | [lemonsqueezy.com](https://www.lemonsqueezy.com) 注册，**完成 KYC** |
| 一个真实邮箱 + 身份证件 | 通过 KYC 必需 |
| ngrok 或 Vercel 部署 | 用于 webhook 接收（沙箱也需要可访问 URL） |
| Node.js | ≥ 18.18 |

### 2. 整体流程总览

```
 ① 注册 + KYC ──► ② 创建 Store ──► ③ 创建 2 个 Product
                                         │
                                         ▼
 ⑨ 验证：登录 → 订阅 ──► ⑧ 部署到 Vercel ──► ⑦ 写 Webhook
        → 收到 webhook                              │
        → DB 标记 active                            │
                                         ◄─── ⑥ 写 Checkout API
                                                   │
                                         ◄─── ⑤ 写 Customer Portal API
                                                   │
                                         ◄─── ④ 装 SDK + 配 ENV
```

### 3. 步骤一：注册 + KYC

1. 浏览器打开 https://app.lemonsqueezy.com/register
2. 邮箱 / 密码注册（也支持 Google OAuth）
3. 登录后进入 Onboarding：
   - 业务类型：选 `Software` / `Digital products` / `SaaS` 之一
   - 国家：选 `China` 也可，无需海外主体
   - 业务描述：1–2 句话说清你卖什么
4. **完成 KYC**：上传护照或身份证 + 地址证明（账单截图）
5. 配置收款方式：
   - **首选 PayPal**（大陆开发者最便利）：填 PayPal 邮箱即可
   - 或 Wise / 银行账户

```
   注册流程
   ┌──────────────────────────────────────────────────┐
   │ 注册账号 → KYC（1–3 天审核） → 配置收款方式      │
   │   ↓                                              │
   │ 审核期间可全功能使用 Test Mode（不能收真钱）     │
   │   ↓                                              │
   │ 审核通过后切换 Live Mode 即可正式收款            │
   └──────────────────────────────────────────────────┘
```

### 4. 步骤二：创建 Store

1. Dashboard → 左上角 **Create new store**
2. 配置：

```
 ┌────────────────────────────────────────────┐
 │ Store Name:     vercel-demo                │
 │ Store URL:      vercel-demo.lemonsqueezy.com│
 │ Currency:       USD                        │
 │ Timezone:       UTC                        │
 │                                            │
 │ Logo:           （可选）                   │
 │ Brand Color:    #000000（可选）            │
 └────────────────────────────────────────────┘
                       ↓
                 [ Create Store ]
```

> 一个账号下可建多个 Store，按产品线 / 品牌隔离。**记下 `Store ID`**（在 Settings → API 可看），后续 API 调用需要。

### 5. 步骤三：创建 2 个 Product（订阅 + 一次性）

#### 5.1 订阅产品（Pro Monthly）

1. Dashboard → **Products → New Product**
2. 配置：

```
 ┌──────────────────────────────────────────────────┐
 │ Type:         Subscription                       │
 │ Name:         Pro Monthly                        │
 │ Description:  Unlimited API calls + priority...  │
 │ Price:        $9.99 / month                      │
 │ Billing:      Monthly                            │
 │ Trial:        7 days（可选）                     │
 │ Status:       Published                          │
 └──────────────────────────────────────────────────┘
```

3. 创建后进入 Product 详情页，记下：
   - **Product ID**（数字 ID）
   - **Variant ID**（数字 ID）—— Checkout 时用这个

> Lemon Squeezy 把"商品定价方案"叫 **Variant**——一个 Product 可以有多个 Variant（如月付 / 年付），每个 Variant 是独立的可购买单位。**Checkout API 接收的是 `variant_id`，不是 `product_id`，这是新手最容易出错的点**。

#### 5.2 一次性付费产品（Top-up Pack）

```
 ┌──────────────────────────────────────────────────┐
 │ Type:         Single Payment                     │
 │ Name:         Top-up 30 Credits                  │
 │ Description:  30 additional credits (no expiry)  │
 │ Price:        $4.99                              │
 │ Status:       Published                          │
 └──────────────────────────────────────────────────┘
```

记下 **Variant ID**。

### 6. 步骤四：创建 API Key + Webhook Secret

#### 6.1 API Key

1. Settings → **API → Create API key**
2. 名称：`vercel-demo`
3. 复制 Key（形如 `eyJ0eXAi...`，**仅显示一次**）

#### 6.2 Webhook Secret

1. Settings → **Webhooks → Create**
2. 配置：

```
 ┌────────────────────────────────────────────────────────┐
 │ Callback URL:  https://<vercel-domain>/api/webhooks/ls │
 │                （本地开发用 ngrok 暴露 localhost:3000）│
 │                                                        │
 │ Events:                                                │
 │  ☑ order_created                                       │
 │  ☑ subscription_created                                │
 │  ☑ subscription_updated                                │
 │  ☑ subscription_cancelled                              │
 │  ☑ subscription_resumed                                │
 │  ☑ subscription_expired                                │
 │  ☑ subscription_paused                                 │
 │  ☑ subscription_unpaused                               │
 │  ☐ subscription_payment_success                        │
 │  ☐ subscription_payment_failed                         │
 │  ☐ subscription_payment_recovered                      │
 │  ☐ license_key_created   （仅卖 license 时勾）         │
 │                                                        │
 │ Signing Secret:  <自己起一个长随机串，例如 32 字符>     │
 └────────────────────────────────────────────────────────┘
```

> ⚠️ **Signing Secret 是你自己设定的**，不是平台给的——这点和 Stripe / Resend 不同。Lemon Squeezy 用此 secret 做 HMAC-SHA256 签名，应用侧用同一个 secret 校验。

### 7. 步骤五：本地装 SDK + 配置环境变量

```bash
cd vercel-demo
npm install @lemonsqueezy/lemonsqueezy.js
```

**编辑 `.env.local`**：

```bash
# Lemon Squeezy API
LEMONSQUEEZY_API_KEY=eyJ0eXAi...
LEMONSQUEEZY_STORE_ID=12345
LEMONSQUEEZY_WEBHOOK_SECRET=<和步骤 6.2 设的 secret 一致>

# Variant IDs（步骤 5 拿到）
LEMONSQUEEZY_VARIANT_PRO_MONTHLY=98765
LEMONSQUEEZY_VARIANT_TOPUP_30=98766

# 公开变量（前端跳转用）
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 8. 步骤六：封装 SDK 客户端

**新建 `lib/lemonsqueezy.ts`**：

```ts
import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js';

let initialized = false;

export function ensureLemonSqueezy() {
  if (initialized) return;
  if (!process.env.LEMONSQUEEZY_API_KEY) {
    throw new Error('LEMONSQUEEZY_API_KEY not set');
  }
  lemonSqueezySetup({
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    onError: (err) => console.error('[LemonSqueezy]', err),
  });
  initialized = true;
}
```

> SDK 用全局单例配置（不像 Stripe 是 new 出来的），所以包一个 `ensureLemonSqueezy()` 在每个 API 路由开头调用即可。

### 9. 步骤七：写 Checkout API（同时支持订阅和一次性）

**新建 `app/api/checkout/route.ts`**：

```ts
import { NextResponse } from 'next/server';
import { createCheckout } from '@lemonsqueezy/lemonsqueezy.js';
import { z } from 'zod';
import { ensureLemonSqueezy } from '@/lib/lemonsqueezy';

export const runtime = 'nodejs';

const requestSchema = z.object({
  productType: z.enum(['subscription', 'topup']),
  email: z.string().email(),
  userId: z.string(),
});

export async function POST(req: Request) {
  ensureLemonSqueezy();

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { productType, email, userId } = parsed.data;
  const variantId =
    productType === 'subscription'
      ? process.env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY!
      : process.env.LEMONSQUEEZY_VARIANT_TOPUP_30!;

  const { data, error } = await createCheckout(
    process.env.LEMONSQUEEZY_STORE_ID!,
    variantId,
    {
      checkoutData: {
        email,
        custom: { user_id: userId, product_type: productType },
      },
      productOptions: {
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
        receiptButtonText: 'Back to App',
        receiptThankYouNote: 'Thanks for your purchase!',
      },
      checkoutOptions: {
        embed: false,           // 改 true 可在你的页面里弹层（需引 lemon.js）
        media: false,
        logo: true,
      },
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ url: data?.data.attributes.url });
}
```

**关键点**：
- `custom` 字段会原封不动透传到 webhook，**用它在订单和你的 user_id 之间建立连接**
- `redirectUrl` 是支付成功后买家跳回你网站的地址
- `embed: false` 用 hosted page 跳转模式；改 `true` 可做成 overlay 弹层

### 10. 步骤八：写 Webhook 接收

**新建 `app/api/webhooks/ls/route.ts`**：

```ts
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 关键：Lemon Squeezy 校签需要原始 raw body
// Next.js App Router 中 req.text() 即可拿到
function verifySignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}

// 简单的内存幂等表（demo 用；生产用 DB 唯一约束）
const seen = new Set<string>();

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const eventName = payload.meta.event_name as string;
  const eventId = req.headers.get('x-event-id') ?? `${eventName}-${payload.data.id}`;

  if (seen.has(eventId)) {
    return NextResponse.json({ ok: true, dedup: true });
  }
  seen.add(eventId);

  const userId = payload.meta.custom_data?.user_id as string | undefined;
  const productType = payload.meta.custom_data?.product_type as string | undefined;

  console.log('[LS webhook]', eventName, { userId, productType });

  switch (eventName) {
    case 'order_created':
      // 一次性购买：根据 productType 加 credits
      if (productType === 'topup' && userId) {
        // await db.profiles.update(userId, { credits: { increment: 30 } });
      }
      break;

    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed':
      // 订阅生效 / 升级 / 续订成功
      // status 在 payload.data.attributes.status: 'active'|'on_trial'|'past_due'...
      // ends_at / renews_at / trial_ends_at 同样在 attributes 里
      if (userId) {
        // await db.profiles.update(userId, {
        //   tier: 'pro',
        //   ls_subscription_id: payload.data.id,
        //   ls_status: payload.data.attributes.status,
        //   current_period_end: payload.data.attributes.renews_at,
        // });
      }
      break;

    case 'subscription_cancelled':
      // 用户在 Customer Portal 取消（period 结束才真正失效）
      if (userId) {
        // await db.profiles.update(userId, { cancel_at_period_end: true });
      }
      break;

    case 'subscription_expired':
      // 订阅彻底失效，降回 free
      if (userId) {
        // await db.profiles.update(userId, { tier: 'free', ls_status: 'expired' });
      }
      break;

    case 'subscription_payment_failed':
      // 续费失败 → 标记 past_due，发邮件让用户更新支付方式
      break;

    default:
      console.log('[LS webhook] unhandled event:', eventName);
  }

  return NextResponse.json({ ok: true });
}
```

**关键点（务必理解）**：

1. **`x-signature` header 是 hex-encoded HMAC-SHA256(rawBody, webhook_secret)**——必须用 raw body 校验，不能先 `JSON.parse` 再算
2. **必须幂等**：Lemon Squeezy 在 webhook 失败 / 超时时会重投，生产环境用 `events` 表加 `event_id` 唯一约束去重
3. **`custom_data` 通过 `payload.meta.custom_data` 取**，不是 `data.attributes`
4. **订阅生命周期事件**比 Stripe 多几个（`paused` / `resumed` / `expired`），都要分别处理
5. **不要在 webhook 里做长任务**——3s 内必须返回，否则平台判超时；耗时操作进队列

### 11. 步骤九：Customer Portal（用户自助管理订阅）

Lemon Squeezy 自带 customer portal，无需自建 UI。每个订阅对象都自带一个 portal URL：

**新建 `app/api/billing/portal/route.ts`**：

```ts
import { NextResponse } from 'next/server';
import { getSubscription } from '@lemonsqueezy/lemonsqueezy.js';
import { ensureLemonSqueezy } from '@/lib/lemonsqueezy';

export async function POST(req: Request) {
  ensureLemonSqueezy();
  const { subscriptionId } = await req.json();

  const { data, error } = await getSubscription(subscriptionId);
  if (error || !data) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  // urls.customer_portal 由 Lemon Squeezy 即时签发，包含一次性 token
  const portalUrl = data.data.attributes.urls.customer_portal;
  return NextResponse.json({ url: portalUrl });
}
```

> Portal 里用户可以：取消订阅 / 切换月付↔年付 / 更新支付方式 / 下载历史发票 / 申请退款。

### 12. 步骤十：写最简前端触发

**修改 `app/page.tsx`**：

```tsx
'use client';
import { useState } from 'react';

export default function Home() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<'sub' | 'topup' | null>(null);

  const checkout = async (productType: 'subscription' | 'topup') => {
    setLoading(productType === 'subscription' ? 'sub' : 'topup');
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productType,
        email,
        userId: 'demo-user-1',  // 真实场景从 session 取
      }),
    });
    const { url, error } = await res.json();
    setLoading(null);
    if (url) location.href = url;
    else alert(error);
  };

  return (
    <main className="p-8 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Vercel Demo + Lemon Squeezy</h1>
      <input
        className="w-full border p-2 rounded"
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="space-y-2">
        <button
          className="w-full bg-black text-white py-3 rounded disabled:opacity-50"
          disabled={!email || loading !== null}
          onClick={() => checkout('subscription')}
        >
          {loading === 'sub' ? 'Loading…' : 'Subscribe Pro $9.99/mo'}
        </button>
        <button
          className="w-full border py-3 rounded disabled:opacity-50"
          disabled={!email || loading !== null}
          onClick={() => checkout('topup')}
        >
          {loading === 'topup' ? 'Loading…' : 'Buy 30 Credits $4.99'}
        </button>
      </div>
    </main>
  );
}
```

**新建 `app/billing/success/page.tsx`**（支付成功跳回页）：

```tsx
export default function BillingSuccessPage() {
  return (
    <main className="p-8 max-w-md mx-auto text-center space-y-4">
      <h1 className="text-2xl font-bold">✓ Payment Successful</h1>
      <p>Your access will be activated shortly. Check your email for a receipt.</p>
      <a href="/" className="inline-block underline">Back to home</a>
    </main>
  );
}
```

### 13. 步骤十一：本地用 ngrok 测 Webhook

webhook 必须有公网 URL，本地开发要用 [ngrok](https://ngrok.com) 暴露：

```bash
# 终端 1
npm run dev

# 终端 2
ngrok http 3000
# 拿到 https://xxxx-xx-xx.ngrok-free.app
```

回 Lemon Squeezy → Webhooks → 编辑刚才的 endpoint，把 URL 改成：
```
https://xxxx-xx-xx.ngrok-free.app/api/webhooks/ls
```

完整流程测一遍：

1. `localhost:3000` 输入邮箱 → 点 **Subscribe Pro**
2. 跳到 Lemon Squeezy hosted checkout
3. **Test Mode 下用测试卡号**：`4242 4242 4242 4242` / 任意未来日期 / 任意 CVC
4. 支付成功后跳回 `/billing/success`
5. 终端 1 应该看到 webhook 日志：
   ```
   [LS webhook] order_created { userId: 'demo-user-1', productType: 'subscription' }
   [LS webhook] subscription_created { userId: 'demo-user-1', productType: 'subscription' }
   ```

### 14. 步骤十二：部署到 Vercel + 配置环境变量

```bash
git add .
git commit -m "feat: integrate lemon squeezy"
git push
```

**在 Vercel Dashboard 配置环境变量**：

```
   Project → Settings → Environment Variables

   ┌──────────────────────────────────────────────────────────────┐
   │ LEMONSQUEEZY_API_KEY            Production / Preview         │
   │ LEMONSQUEEZY_STORE_ID           Production / Preview / Dev   │
   │ LEMONSQUEEZY_WEBHOOK_SECRET     Production only ⚠            │
   │ LEMONSQUEEZY_VARIANT_PRO_MONTHLY    Production / Preview / Dev│
   │ LEMONSQUEEZY_VARIANT_TOPUP_30   Production / Preview / Dev   │
   │ NEXT_PUBLIC_APP_URL             Production / Preview / Dev   │
   └──────────────────────────────────────────────────────────────┘
```

> ⚠️ `WEBHOOK_SECRET` 不要勾给 Preview——任何 PR 都会拿到运行环境，等于泄露 secret。
>
> 部署完成后回 Lemon Squeezy → Webhooks，把 Callback URL 改成线上地址：`https://vercel-demo.vercel.app/api/webhooks/ls`

### 15. 完整数据流图

```
   ┌──────────────────────────────────────────────────────────────┐
   │  浏览器 (vercel-demo.vercel.app)                             │
   │  填邮箱 → 点 Subscribe                                       │
   └────────────────────────────┬─────────────────────────────────┘
                                │ POST /api/checkout
                                ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  Vercel Serverless Function                                  │
   │  ├─ Zod 校验                                                  │
   │  ├─ createCheckout(storeId, variantId, { custom: { userId }})│
   │  └─ 返回 hosted URL                                           │
   └────────────────────────────┬─────────────────────────────────┘
                                │ 302 Redirect
                                ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  Lemon Squeezy Hosted Checkout                               │
   │  ├─ 自动判定买家国家 → 计算 VAT                               │
   │  ├─ 收卡号 / PayPal                                           │
   │  └─ 成功 → 跳回 /billing/success                              │
   └────────────────────────────┬─────────────────────────────────┘
                                │ 异步 Webhook (X-Signature: HMAC)
                                ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  /api/webhooks/ls                                            │
   │  ├─ 校签（HMAC-SHA256(rawBody, secret)）                     │
   │  ├─ 幂等去重（event_id）                                      │
   │  ├─ switch (event_name)                                       │
   │  │    ├─ order_created       → 加 credits                    │
   │  │    ├─ subscription_created → tier=pro                     │
   │  │    ├─ subscription_cancelled → cancel_at_period_end=true  │
   │  │    └─ subscription_expired → tier=free                    │
   │  └─ 写库 + 返回 200                                          │
   └──────────────────────────────────────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  你的应用解锁 Pro 权限 / 增加 credits                         │
   └──────────────────────────────────────────────────────────────┘
```

### 16. 验证清单

| # | 操作 | 预期结果 | 验证什么 |
| --- | --- | --- | --- |
| 1 | 输入邮箱 → Subscribe Pro | 跳到 LS Hosted Checkout 页 | Checkout API |
| 2 | 用 4242 测试卡完成支付 | 跳回 `/billing/success` | redirectUrl |
| 3 | 终端日志 | 看到 `subscription_created` | Webhook + 校签 |
| 4 | LS Dashboard → Subscriptions | 看到一个 active 订阅 | 后台数据一致 |
| 5 | LS Dashboard → 订阅详情 → Customer Portal | 用户能取消 / 换卡 | Customer Portal |
| 6 | 在 Portal 里取消订阅 | 终端收到 `subscription_cancelled` | 取消事件 |
| 7 | 重复 Subscribe Pro 但用同一邮箱 | LS 自动识别已有 customer | 客户去重 |
| 8 | 输入邮箱 → Buy 30 Credits | 完成支付，收到 `order_created` | 一次性付费链路 |
| 9 | 修改 webhook URL 为错误地址 | LS Dashboard 看到失败重试 | Webhook 重试机制 |
| 10 | 仿造一个签名调 webhook | 返回 401 | 签名校验生效 |

### 17. Test Mode vs Live Mode 切换

```
   Test Mode（沙箱）              Live Mode（正式）
   ──────────────────             ──────────────────
   ✓ 4242 测试卡可用              ✗ 仅真实卡 / PayPal
   ✓ 可任意创建产品 / 订单         ✓ 真实收款
   ✗ 不会真的扣钱                 ✓ 抽成 5%+50¢ 生效
   ✗ 不发 KYC 受限                ✓ KYC 必须通过
   ✓ Webhook secret 共享或独立      ✓ 通常独立 secret
   ✓ Variant ID 与 Live 不同 ⚠     ✓ ENV 切换时务必同步换
```

> Dashboard 右上角有 **Test mode 开关**，切换后 API key / Variant ID 全部独立。**线上部署务必用 Live mode 的全套 ID 和 Key**——这是新手最常踩的雷之一。

### 18. 关键限制 / 注意事项提醒

| 项 | 说明 |
| --- | --- |
| **客单价下限** | 平台最低 $0.99，但 < $5 实际抽成占比过高，不建议 |
| **退款规则** | 用户在 LS Customer Portal 自助退款（默认 30 天内）；超期需联系 LS 客服 |
| **退款抽成** | 退款时平台费 50¢ 不退，5% 那部分按比例退 |
| **结算最低门槛** | $10（PayPal）/ 视提现方式 |
| **结算延迟** | 美国节日 / 跨境合规检查可能延迟 1–2 周 |
| **风控冻结** | 异常订单（同卡多次失败、IP 翻墙）可能被风控，需补充材料 |
| **License key API 调用次数** | 单 key 每月 100 万次校验额度，超出加价 |
| **不支持微信 / 支付宝** | 这是大陆开发者最大限制 |
| **不支持加密货币 / 实物 / 服务** | ToS 明确禁止 |
| **发票抬头是 LS** | 买家发票上是 Lemon Squeezy（MoR 模式无法改） |

### 19. 后续常见操作速查

| 需求 | 操作 |
| --- | --- |
| 添加年付订阅 | Product 详情 → Add Variant → $99.99 / yearly |
| 创建优惠码 | Discounts → New → 设置 % 或固定金额 / 限时限量 |
| 启用 Affiliate | Affiliates → Set up → 配抽成比例 |
| 自定义 checkout 品牌 | Store → Branding → Logo / Color / 字体 |
| 切换沙箱 / 正式 | Dashboard 右上角 Toggle |
| 接收 Bounce / Refund 事件 | Webhooks → 加 `subscription_payment_refunded` 等 |
| 导出订单 | Orders → Export CSV |
| 查询单笔订单 API | `getOrder(orderId)` |
| Embed 弹层 Checkout | 前端引 `lemon.js` + `data-overlay` 属性 |
| 卖软件激活码 | Product → Type: License → 配 license 校验 API |

### 20. 与 Supabase 联动（进阶预告）

如果同时接入了 [supabase.md](./supabase.md) 的 Auth 体系，可以把 Lemon Squeezy 订阅状态写入 `profiles` 表：

```sql
-- 扩展 profiles 表
alter table profiles add column tier text default 'free';
alter table profiles add column ls_customer_id text;
alter table profiles add column ls_subscription_id text;
alter table profiles add column ls_status text;
alter table profiles add column current_period_end timestamptz;
alter table profiles add column credits int default 0;

-- 幂等表
create table ls_events (
  event_id text primary key,
  event_name text not null,
  received_at timestamptz default now()
);
```

webhook 中改用 service role 客户端写库：

```ts
import { createAdminClient } from '@/lib/supabase/admin';
const supabase = createAdminClient();

// 幂等
const { error: dupErr } = await supabase
  .from('ls_events')
  .insert({ event_id: eventId, event_name: eventName });
if (dupErr?.code === '23505') return NextResponse.json({ ok: true, dedup: true });

// 业务
if (eventName === 'subscription_created' && userId) {
  await supabase.from('profiles').update({
    tier: 'pro',
    ls_subscription_id: payload.data.id,
    ls_status: payload.data.attributes.status,
    current_period_end: payload.data.attributes.renews_at,
  }).eq('id', userId);
}
```

> 这就构成了完整的「Vercel 部署 + Supabase Auth/DB + Lemon Squeezy 收款」三件套，是大陆个人开发者出海最常见的最小组合。

---

## 四、一句话总结

- **平台**：Lemon Squeezy = 为独立开发者设计的全球收款 + 税务合规 MoR，2024 年被 Stripe 收购，背书强；卖软件 / SaaS / 课程 / license 一站式
- **抽成**：**5% + 50¢ / 笔**，无月费 / 无最低；客单价 ≥ $5 划算，< $5 不建议
- **大陆主体**：✅ **个人 / 公司均可注册**，无需海外公司，**PayPal 提现到大陆银行卡是最稳路径**
- **接入三步走**：① Lemon Squeezy 注册 + KYC + 创建 Store / Product 拿 Variant ID → ② `npm install @lemonsqueezy/lemonsqueezy.js` 写 `app/api/checkout/route.ts`（订阅 + 一次性同一接口分流）+ `app/api/webhooks/ls/route.ts`（HMAC 校签 + 幂等 + switch 事件名）→ ③ ENV 同步到 Vercel、把 webhook 回调 URL 指向部署域名，`git push` 自动生效；本地开发用 ngrok 暴露 webhook 端口
- **务必牢记的 3 条**：
  1. Checkout 接收的是 **`variant_id` 不是 `product_id`**
  2. Webhook 校签**必须用 raw body**，且 secret 是**自己设的**而非平台给的
  3. **Test Mode 和 Live Mode 的 ID/Key 完全独立**，切换时务必同步换 ENV
