# Supabase 接入指南

> 汇总 Supabase 平台介绍、Free / Pro / Team 计费模式、以及在 `vercel-demo` 项目之上从零接入的 Demo 实操步骤。
>
> 本文档配合 [vercel.md](./vercel.md) 阅读：Vercel 负责前端 + Serverless 部署，Supabase 负责 Auth + 数据库 + 文件存储。

---

## 一、Supabase 平台简介

Supabase 是**开源的 Firebase 替代品**，把 Postgres 数据库、用户认证、文件存储、实时订阅、边缘函数打包成一个平台，让开发者在不写传统后端的前提下就能完成"全栈应用"。

### 核心定位

> **「一个 Postgres 项目，自带 API、Auth、Storage、Realtime」**

Supabase 不是把数据库藏在自己的抽象层后面，而是直接给你一个真正的 Postgres，再把"前端能直接调用的能力"自动生成出来。这意味着你既能用 ORM/SQL 直连，也能像 Firebase 那样用 SDK。

### 核心能力

| 能力 | 说明 | 本 demo 是否覆盖 |
| --- | --- | --- |
| **Postgres 数据库** | 真正的 Postgres 15+ 实例，支持扩展、外键、视图、函数 | ✅ |
| **Auth（身份认证）** | 邮箱密码、Magic Link、Phone OTP、20+ OAuth 提供商 | ✅ |
| **内置邮件服务** | 注册确认 / 密码重置 / Magic Link 由 Supabase SMTP 发出 | ✅ |
| **RLS（行级安全）** | 数据库自动按策略过滤，前端可直连 DB 而不泄露 | ✅ |
| **`@supabase/ssr`** | Next.js Server Component / API Route 的 Cookie 会话集成 | ✅ |
| **Service Role 密钥** | 绕过 RLS 的"超级管理员"客户端，专用于 webhook / 脚本 | ✅ |
| **RPC（存储过程）** | 把多步操作封装在 Postgres 函数里，原子化执行 | ✅ |
| **Database Triggers** | 数据变化时自动跑 SQL（如新用户注册自动建 profile） | ✅ |
| **`auth.uid()` 内置函数** | RLS 策略读取当前请求用户 ID 的核心函数 | ✅ |
| **pg_cron** | Postgres 内置定时调度器（无需外部 cron 服务） | 🔵 简介 |
| **pg_net** | 让 Postgres 函数能直接发 HTTP 请求 | 🔵 简介 |
| **Vault** | 数据库内加密存储 secret，pg_net 等扩展可读取 | 🔵 简介 |
| **Storage** | S3 兼容对象存储 + RLS 策略 + 图片 transform | ❌ 不演示 |
| **Realtime** | WebSocket 订阅表变更、广播、Presence | ❌ 不演示 |
| **Edge Functions** | Deno 运行时的边缘函数（类似 Cloudflare Workers） | ❌ 不演示 |
| **pgvector** | 向量字段 + 相似度检索，AI 应用必备 | ❌ 不演示 |

### 运行模型

```
   浏览器 ──► supabase-js SDK ──► PostgREST/GoTrue/Storage API
                                          │
                                          ▼
                          ┌──────────────────────────────┐
                          │   Postgres 数据库            │
                          │   ├─ 业务表（受 RLS 保护）   │
                          │   ├─ auth.users（认证）      │
                          │   ├─ 触发器 / 函数 / RPC    │
                          │   └─ 扩展（pg_cron, vault…）│
                          └──────────────────────────────┘
```

关键点：**所有安全策略都收敛到数据库层**——前端拿着 JWT 直接发请求，Postgres 通过 RLS 自动判断"你能看到/改哪些行"，不需要中间手写一层后端 API。

### 与传统后端的关系

| 传统三层架构 | Supabase 模式 |
| --- | --- |
| 前端 → 后端 API → 数据库 | 前端 → Supabase SDK → 数据库（RLS 直接保护） |
| 安全靠后端代码"记得鉴权" | 安全靠数据库 RLS 策略强制执行 |
| 每加一个表都要写 CRUD API | 表建好就自动有 REST + GraphQL 端点 |
| Auth 自己实现或接 Auth0 | Supabase Auth 内置，与 RLS 无缝联动 |

**何时仍需要自己的后端？** 当业务逻辑复杂（比如 LongCut 调用 AI、对接 Stripe webhook）、或者有第三方密钥不能下发到前端时——这时把 Next.js API Routes 作为 BFF 层即可，**Supabase 只负责数据和认证**。

### 适合 / 不适合场景

**适合**：
- 中小型 SaaS、内部工具、MVP 快速验证
- 多租户应用（用户数据天然隔离）
- 需要 Postgres 全部能力（事务、外键、函数、扩展）
- 不想自己运维数据库 + 认证服务的团队

**不适合**：
- 极致的低延迟读写（共享 Postgres + RLS 比裸库慢）
- 需要复杂分库分表 / 异构数据库
- 强合规要求且只能上私有云（Supabase 提供企业版自托管，但成本高）
- 重度 NoSQL / 文档库场景

---

## 二、Free vs Pro vs Team 计费详解

> Supabase 计费会调整，以下数值为常见配额范围与结构性差异，**实际数值请以 [supabase.com/pricing](https://supabase.com/pricing) 当前页面为准**。

### 1. 总体定位

| 维度 | Free | Pro | Team | Enterprise |
| --- | --- | --- | --- | --- |
| 价格 | **$0** | **$25 / 项目 / 月** 起 | **$599 / 月** 起 | 定制 |
| 目标用户 | 个人 / 学习 / Demo | 创业团队 / 生产环境 | 中型团队 / 合规起步 | 大客户 / 私有部署 |
| 商业用途 | 允许（但有暂停风险） | ✅ 推荐 | ✅ | ✅ |
| 项目数 | 2 个 | 无限 | 无限 | 无限 |
| 暂停机制 | **7 天无活动自动暂停** | 不暂停 | 不暂停 | 不暂停 |
| SLA | 无 | 99.9% | 99.9% | 99.99% + 合同 |

**最关键的一条**：Free 套餐的项目 7 天没访问会被冻结，需要手动重启——**绝不能把生产环境放 Free 上**。

### 2. 计费模型结构

Supabase 采用**「项目订阅 + 包含额度 + 超额按量 + 计算资源升级 + Add-ons」** 五段式：

```
   订阅基础费              每月包含额度              超额按量
 ┌─────────────┐        ┌─────────────────┐       ┌──────────────┐
 │ Free: $0    │   +    │ DB / Storage /  │   +   │ 按 GB / MAU /│
 │ Pro:  $25   │        │ Egress / MAU /  │       │ 函数调用计费 │
 │ Team: $599  │        │ Functions ...   │       └──────┬───────┘
 └─────────────┘        └─────────────────┘              │
                                                          ▼
                                              ┌──────────────────────┐
                                              │ Compute 升级（实例） │
                                              │ + Add-ons（PITR 等） │
                                              └──────────────────────┘
```

- Free **不允许超额**：触顶后部分功能被限制（如新连接被拒）
- Pro / Team 允许超额，按量叠加在月费上；可在 Dashboard 设置消费上限
- Compute 和 Add-ons 是**叠加项**，与套餐独立计费

### 3. 资源用量配额（核心资源）

| 维度 | Free 额度 | Pro 额度 | 超额单价（参考） |
| --- | --- | --- | --- |
| **数据库存储** | 500 MB | 8 GB 含 | ~$0.125 / GB / 月 |
| **文件存储 (Storage)** | 1 GB | 100 GB 含 | ~$0.021 / GB / 月 |
| **流量 / Egress** | 5 GB | 250 GB 含 | ~$0.09 / GB |
| **MAU（月活用户）** | 50,000 | 100,000 含 | ~$0.00325 / MAU |
| **Edge Functions 调用** | 500K | 2M 含 | ~$2 / 百万次 |
| **Realtime 消息** | 2M | 5M 含 | ~$2.50 / 百万条 |
| **Realtime 并发连接** | 200 | 500 | 按峰值计 |
| **数据传输（Egress）日志** | 短期 | 7 天 | 长保留另收 |

> Pro 套餐的 $25 已包含上述基础额度，超出部分才另计。

### 4. 计算资源（Compute）规格

数据库默认是 **Micro**（共享 CPU），可独立升级实例规格：

| 规格 | 月费（参考） | 适用场景 |
| --- | --- | --- |
| Micro | 已含在 Pro | 小流量、原型 |
| Small | ~$15 | 轻量生产、千级 DAU |
| Medium | ~$60 | 中等流量、万级 DAU |
| Large | ~$110 | 高并发 |
| XL → 16XL | $230 → $3,730 | 大数据量 / 高并发 |

**升级 Compute 不需换套餐**——可以 Pro + Large 实例组合。

### 5. 高级 Add-ons（附加费）

| 功能 | 价格（参考） | 用途 |
| --- | --- | --- |
| **Point-in-Time Recovery (PITR)** | $100/月 起 | 任意时间点恢复数据库 |
| **Read Replica（只读副本）** | 按 Compute 规格收费 | 读写分离 / 异地容灾 |
| **Custom Domain** | $10/月 | `db.yourdomain.com` 替代 `*.supabase.co` |
| **Branching（数据库分支）** | $0.32 / 分支 / 天 | 像 Git 给数据库开 PR 分支 |
| **Log Retention 延长** | $0.10/GB | 默认 1 天，最长 90 天 |
| **IPv4 地址** | $4/月 | 默认仅 IPv6，需要 IPv4 时启用 |

### 6. Auth 相关计费

| 项目 | 费用 |
| --- | --- |
| **邮件 OTP / Magic Link / 确认链接** | 免费（Supabase 自带 SMTP） |
| **SMS OTP** | 按 Twilio / MessageBird 实际费用 |
| **WebAuthn / TOTP MFA** | Pro 起免费 |
| **SAML SSO** | Team 起免费，Pro 需付 add-on |
| **OAuth 提供商**（Google / GitHub / 等 20+） | 免费 |

### 7. Free 套餐"暂停"机制（重要警告）

```
                ┌──────────────────────────┐
                │   Free 项目              │
                └────────────┬─────────────┘
                             │  7 天无活动
                             ▼
                ┌──────────────────────────┐
                │   ⚠ Auto-Paused          │
                │   - 数据库不接受新连接   │
                │   - API 返回 503         │
                └────────────┬─────────────┘
                             │  Dashboard 点 Restore
                             ▼
                ┌──────────────────────────┐
                │   恢复（数据未丢）       │
                └──────────────────────────┘
```

**生产环境必须升级 Pro 以避免暂停**。

### 8. 适用判断流程

```
                 ┌────────────────────────────┐
                 │   你要部署什么应用？       │
                 └──────────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        个人 / Demo       创业 / 生产       团队 / 合规
              │                 │                 │
              ▼                 ▼                 ▼
            Free              Pro $25         Team $599
        (会暂停 / 2 项目)   (生产 OK)        (SOC2 / SSO)

         触发升级到 Pro 的常见信号：
         ├─ 项目要 7×24 在线（不能被暂停）
         ├─ DB > 500 MB 或 月活 > 50K
         ├─ 流量 > 5 GB / 月
         ├─ 需要 PITR / Read Replica / Branching
         ├─ 商业用途 + SLA 要求
         └─ 需要更长日志保留

         触发升级到 Team 的信号：
         ├─ SOC2 / HIPAA 等合规审计
         ├─ SSO（SAML） / 多团队权限管理
         ├─ 24×7 优先支持
         └─ Audit Log 长期保留
```

### 9. 对 LongCut / vercel-demo 类应用的成本估算

```
   假设月活 5,000 用户、月流量 30 GB、DB 2 GB：
   ┌─────────────────────────────────────┐
   │ Pro 套餐基础            $25 / 月   │
   │ Compute (Micro 默认含)   $0        │
   │ DB 2 GB（含 8 GB）       $0        │
   │ Egress 30 GB（含 250GB）$0        │
   │ MAU 5K（含 100K）        $0        │
   │ ────────────────────────────────── │
   │ 月费合计：              $25        │
   └─────────────────────────────────────┘
   增长到 50 GB DB / 200K MAU 才会显著超额。
```

---

## 三、接入 Supabase Demo 实操（在 vercel-demo 之上）

> 目标：在已有的 `vercel-demo` 项目（Next.js 16 App Router）基础上，从零集成 **Auth + Postgres + RLS**，跑通"注册 → 登录 → 写入笔记 → 验证 RLS 隔离 → Vercel 部署"完整闭环。

### 1. 前置条件

| 工具 | 要求 |
| --- | --- |
| Node.js | ≥ 18.18（vercel-demo 用 20.x） |
| Git | 任意近期版本 |
| Supabase 账号 | supabase.com 注册（推荐 GitHub OAuth） |
| 已部署的 Vercel 项目 | 见 vercel.md 步骤一至五 |
| 可选：Supabase CLI | `npm i -g supabase` 用于本地数据库迁移 |

### 2. 整体流程总览

```
 ① 注册 Supabase ──► ② 创建项目 ──► ③ 拿三个 key
                                          │
                                          ▼
 ④ 本地装包 ──► ⑤ 写 .env.local ──► ⑥ 封装 Client（4 个文件）
                                          │
                                          ▼
 ⑨ 部署到 Vercel ◄── ⑧ 实现 Auth + Notes ◄── ⑦ SQL Editor 建表 + RLS + Trigger
       │
       └─► ⑩ 验证：注册收邮件 / 登录 / RLS 隔离 / 公网访问
```

### 3. 步骤一：注册 Supabase + 创建项目

1. 浏览器打开 [supabase.com/dashboard](https://supabase.com/dashboard)
2. 点 **Sign in with GitHub**
3. 进入 Dashboard 后，点 **New Project**：

```
 ┌──────────────────────────────────────────────────┐
 │ Project Name:  vercel-demo                        │
 │ Database Password:  <生成强密码并保存>            │
 │ Region:  选离 Vercel 部署区域近的（如 iad1 → us-east-1）│
 │ Plan:    Free                                     │
 │                                                   │
 │ Advanced Configuration（3 个复选框，建议全部勾上）│
 │  ☑ Enable Data API                                │
 │  ☑ Automatically expose new tables and functions  │
 │  ☑ Enable automatic RLS                           │
 └──────────────────────────────────────────────────┘
                    ↓
              [ Create Project ]
              （等待 ~2 分钟启动数据库实例）
```

#### 三个复选框的含义

| 复选框 | 作用 | 建议 |
| --- | --- | --- |
| **Enable Data API** | 开启自动生成的 REST/GraphQL API（PostgREST），让前端能用 `supabase.from('table').select()` | ✅ **必须勾**——不勾的话本 demo 所有 CRUD 都失败 |
| **Automatically expose new tables and functions** | 新建表/函数自动暴露给 Data API，省去手动到 Settings → API 配置 | ✅ **建议勾**——开发体验更顺。内部表（如审计日志）想隐藏时再关 |
| **Enable automatic RLS** | 新建表自动 `ENABLE ROW LEVEL SECURITY`，"默认安全" | ✅ **强烈建议勾**——防止忘开 RLS 导致全表泄露（Supabase 历史多次安全事故的根因） |

> **三个都勾的效果**：新建表 → 自动 expose → 自动启 RLS → 但没策略 → 全部拒绝访问 → 你必须显式 `create policy` 才能让任何人访问。这是最安全的"先全部拒绝、再按需放行"模式。
>
> 注意：勾选 "automatic RLS" 只是**自动打开开关**，不会自动写策略；本文档步骤五的 SQL 仍显式写了 `enable row level security` 作为兜底。

4. 项目创建完成后，到 **Project Settings → API** 拿三个值：

```
   Project URL:        https://<project-ref>.supabase.co
   anon (public) key:  eyJhbGc...（前端可用，受 RLS 保护）
   service_role key:   eyJhbGc...（绕过 RLS，仅服务端用，绝不暴露！）
```

### 4. 步骤二：本地安装依赖

```bash
cd /home/ubuntu/workspace/vercel-demo
npm install @supabase/supabase-js @supabase/ssr
```

| 包 | 作用 |
| --- | --- |
| `@supabase/supabase-js` | 核心 SDK：DB / Auth / Storage / Realtime |
| `@supabase/ssr` | Next.js SSR 专用：Cookie 会话同步 |

### 5. 步骤三：配置环境变量

在 `vercel-demo` 根目录新建 `.env.local`：

```bash
# 浏览器可读（NEXT_PUBLIC_ 前缀）
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# 仅服务端可读（绝不能加 NEXT_PUBLIC_）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

确认 `.gitignore` 已包含 `.env*`，不要提交此文件。

### 6. 步骤四：创建 Supabase 客户端封装

新建 4 个文件，对应 4 种使用场景：

#### `lib/supabase/client.ts`（浏览器组件用）

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

#### `lib/supabase/server.ts`（Server Component / API Route 用）

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component 中无法 set，忽略即可
          }
        },
      },
    }
  );
}
```

#### `lib/supabase/admin.ts`（服务角色，绕过 RLS）

```ts
import { createClient } from '@supabase/supabase-js';

const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseAdmin?: ReturnType<typeof createClient>;
};

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  }
  globalForSupabase.__supabaseAdmin ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  return globalForSupabase.__supabaseAdmin;
}
```

> ⚠️ **安全红线**：此文件只能在 API Route / Server Action / 脚本中 import，**不能在 'use client' 组件中使用**——否则密钥会被打包进浏览器 bundle。

#### `middleware.ts`（根目录，自动刷新会话）

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 触发 token 刷新
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### 7. 步骤五：在 Supabase 创建表 + RLS + Trigger

到 Supabase Dashboard → **SQL Editor**，跑下面这段（一次性把表、RLS、触发器、RPC 全部创建好）：

```sql
-- ① profiles 表（与 auth.users 一对一）
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  notes_count int default 0,
  created_at timestamptz default now()
);

-- ② notes 表
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null check (length(text) > 0),
  created_at timestamptz default now()
);

-- ③ 启用 RLS
alter table profiles enable row level security;
alter table notes enable row level security;

-- ④ RLS 策略：只能看 / 改自己的（用到 auth.uid() 内置函数）
create policy "users see own profile"
  on profiles for select using (auth.uid() = id);

create policy "users update own profile"
  on profiles for update using (auth.uid() = id);

create policy "users full access own notes"
  on notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ⑤ Trigger：新用户注册时自动建 profile 行
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer       -- 用提升权限运行，能写 profiles
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ⑥ RPC 示例：原子化增加 notes_count
create or replace function increment_notes_count(p_user_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  new_count int;
begin
  update profiles
     set notes_count = notes_count + 1
   where id = p_user_id
   returning notes_count into new_count;
  return new_count;
end;
$$;
```

**这一步覆盖了 4 个 Supabase 功能点**：

| 点 | 在 SQL 中的位置 |
| --- | --- |
| Postgres 表 | `create table profiles / notes` |
| RLS 策略 | `enable row level security` + `create policy` |
| `auth.uid()` | 策略中的 `auth.uid() = user_id` |
| Database Trigger | `on_auth_user_created` 触发器 |
| RPC 存储过程 | `increment_notes_count()` 函数 |

### 8. 步骤六：实现 Auth 登录页

#### Auth → URL Configuration 设置

到 Supabase Dashboard → **Authentication → URL Configuration**：

```
Site URL:          http://localhost:3000
Redirect URLs:     http://localhost:3000/auth/callback
                   https://<your-vercel-app>.vercel.app/auth/callback
```

#### `app/login/page.tsx`（客户端组件）

```tsx
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setMsg(error ? error.message : '✓ 已发送确认邮件，请查收');
  };

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) location.href = '/notes';
    else setMsg(error.message);
  };

  const google = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });

  return (
    <main className="p-8 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Login / Sign Up</h1>
      <input className="w-full border p-2 rounded" type="email"
             placeholder="email" value={email}
             onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full border p-2 rounded" type="password"
             placeholder="password" value={password}
             onChange={(e) => setPassword(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={signIn} className="flex-1 bg-black text-white py-2 rounded">
          Sign In
        </button>
        <button onClick={signUp} className="flex-1 border py-2 rounded">
          Sign Up
        </button>
      </div>
      <button onClick={google} className="w-full border py-2 rounded">
        Continue with Google
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </main>
  );
}
```

#### `app/auth/callback/route.ts`（OAuth / 邮件确认回调）

```ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL('/notes', url.origin));
}
```

> 📧 **邮件确认说明**：用户注册后 Supabase 会自动发送一封确认邮件（来自 `noreply@mail.supabase.io`），用户点击链接后才能登录。这套邮件**完全由 Supabase 内置 SMTP 发送**，无需配置。生产环境建议在 **Auth → Email Templates** 自定义模板，并在 **Auth → SMTP Settings** 配置自己的 SMTP（如 Resend / SendGrid）以提高送达率。

### 9. 步骤七：实现 Notes CRUD（验证 RLS 隔离）

#### `app/notes/page.tsx`（Server Component）

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { addNote, deleteNote } from './actions';

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 受 RLS 保护：自动只返回当前用户的笔记
  const { data: notes } = await supabase
    .from('notes')
    .select('id, text, created_at')
    .order('created_at', { ascending: false });

  return (
    <main className="p-8 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">My Notes</h1>
      <p className="text-sm text-gray-600">Logged in as {user.email}</p>

      <form action={addNote} className="flex gap-2">
        <input name="text" required
               className="flex-1 border p-2 rounded"
               placeholder="Write a note..." />
        <button className="bg-black text-white px-4 rounded">Add</button>
      </form>

      <ul className="space-y-2">
        {notes?.map((n) => (
          <li key={n.id} className="border p-3 rounded flex justify-between">
            <span>{n.text}</span>
            <form action={deleteNote}>
              <input type="hidden" name="id" value={n.id} />
              <button className="text-red-500 text-sm">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

#### `app/notes/actions.ts`（Server Actions）

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('notes').insert({
    user_id: user.id,
    text: String(formData.get('text')),
  });
  // 同时调用 RPC 计数
  await supabase.rpc('increment_notes_count', { p_user_id: user.id });

  revalidatePath('/notes');
}

export async function deleteNote(formData: FormData) {
  const supabase = await createClient();
  await supabase.from('notes').delete().eq('id', String(formData.get('id')));
  revalidatePath('/notes');
}
```

> 注意 `addNote` 里**没有手写** `WHERE user_id = ...` 的过滤——RLS 自动加上。哪怕代码写错传了别人的 user_id，`with check (auth.uid() = user_id)` 也会拒绝写入。这就是 RLS 的价值。

### 10. 步骤八：进阶能力示例

下面这些不在主 demo 路径上，但 longcut 实际用到了，列出最小示例供日后参考。

#### A. Service Role 在脚本里的用法（点 8）

新建 `scripts/grant-bonus.ts`：

```ts
import 'dotenv/config';
import { createAdminClient } from '@/lib/supabase/admin';

async function main(email: string) {
  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from('profiles')
    .select('id')
    .eq('display_name', email.split('@')[0])
    .single();

  if (!user) return console.error('User not found');

  // 服务角色绕过 RLS，可以代用户增加 notes_count
  await supabase.rpc('increment_notes_count', { p_user_id: user.id });
  console.log('✓ bonus granted');
}

main(process.argv[2]);
```

运行：`npx tsx scripts/grant-bonus.ts user@example.com`

#### B. pg_cron + pg_net：每天清理过期数据（点 9 + 10）

在 Supabase SQL Editor：

```sql
-- 启用扩展（Free 套餐已可用）
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 每天凌晨 2 点删除 30 天前的笔记
select cron.schedule(
  'cleanup-old-notes',
  '0 2 * * *',
  $$ delete from notes where created_at < now() - interval '30 days' $$
);

-- 进阶：用 pg_net 调用外部 API（如通知 Slack）
select cron.schedule(
  'daily-report',
  '0 9 * * *',
  $$
    select net.http_post(
      url := 'https://hooks.slack.com/services/xxx',
      body := jsonb_build_object('text', 'Daily user count: ' || (select count(*) from profiles))
    );
  $$
);
```

#### C. Supabase Vault：加密存储 secret（点 11）

```sql
-- 在 Vault 里存一个 secret
select vault.create_secret('sk_test_xxx', 'stripe_api_key');

-- 在 pg_net 调用时安全读取
select net.http_post(
  url := 'https://api.stripe.com/v1/customers',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_api_key')
  )
);
```

> Vault 把 secret 用项目的加密密钥加密后存在数据库里，避免硬编码到 SQL 或环境变量里。

### 11. 步骤九：部署到 Vercel + 配置环境变量

1. **本地提交并推送**：

```bash
git add .
git commit -m "feat: integrate supabase auth + notes"
git push
```

Vercel 检测到推送会自动部署，但第一次会**因缺环境变量而失败**。

2. **在 Vercel Dashboard 配置环境变量**：

```
   Project → Settings → Environment Variables

   ┌──────────────────────────────────────────────────────────┐
   │ NEXT_PUBLIC_SUPABASE_URL       Production / Preview / Dev│
   │ NEXT_PUBLIC_SUPABASE_ANON_KEY  Production / Preview / Dev│
   │ SUPABASE_SERVICE_ROLE_KEY      Production only ⚠️         │
   └──────────────────────────────────────────────────────────┘
```

> ⚠️ `SERVICE_ROLE_KEY` **不要勾选 Preview**——任何人开 PR 都会拿到这个 key 的运行环境，等同于泄露。

3. **触发重新部署**：Deployments → 最新一次 → Redeploy

4. **更新 Supabase Auth Redirect URLs**：

回到 Supabase Dashboard → **Authentication → URL Configuration**，把 Vercel 域名加进去：

```
https://vercel-demo-<hash>.vercel.app/auth/callback
https://vercel-demo.vercel.app/auth/callback
```

否则 Google OAuth / 邮件确认链接会跳回错误地址。

### 12. 验证清单

打开浏览器，依次执行：

| # | 操作 | 预期结果 | 验证什么功能点 |
| --- | --- | --- | --- |
| 1 | 访问 `/login`，邮箱注册 user_a@test.com | 收到来自 Supabase 的确认邮件 | Auth + 内置邮件 |
| 2 | 点击邮件链接 | 跳转到 `/notes` 且已登录 | 邮件确认 + Auth 回调 |
| 3 | Supabase Dashboard → Table Editor → profiles | 自动多了一行 user_a 的 profile | Database Trigger |
| 4 | 在 `/notes` 添加 3 条笔记 | 列表显示这 3 条 | Postgres + RLS + RPC |
| 5 | 退出登录，注册 user_b@test.com | 进入 `/notes` 看到**空列表** | RLS 隔离（核心验证） |
| 6 | user_b 添加 1 条笔记 | 只看到自己的 1 条 | RLS 隔离 |
| 7 | Supabase SQL Editor 跑 `select * from notes` | 看到所有用户的所有笔记（admin 视角） | RLS 仅作用于 anon/authenticated 角色 |
| 8 | `git push` 触发部署 | Vercel 公网地址能完整登录 + 加笔记 | Vercel ↔ Supabase 集成 |

### 13. Free 档关键限制提醒

```
   Free 适合：              需要升级 Pro 的信号：
   ────────────             ──────────────────────
   • 个人 Demo / Side       • 项目要 7×24 在线
   • 学习 / POC            • 需要超过 50K MAU
   • 最多 2 个项目          • DB 超过 500 MB
   • 7 天闲置会暂停 ⚠      • 流量超过 5 GB / 月
                            • 需要 PITR / 多区域副本
                            • 商业用途 + SLA
```

---

## 四、一句话总结

- **平台**：Supabase = 开源 Firebase 替代品，Postgres + Auth + Storage + Realtime + Edge Functions 一站式 BaaS
- **Free**：$0、2 项目、500 MB DB、5 GB 流量、**7 天闲置自动暂停**，仅适合 Demo / 学习
- **Pro**：$25/项目/月，含 8 GB DB、250 GB 流量、100K MAU；超额按量；生产可用
- **接入三步走**：① 注册并创建 Supabase 项目 → ② 装 `@supabase/supabase-js + @supabase/ssr`、写 client/server/middleware 三件套 → ③ SQL Editor 建表 + RLS + Trigger，前端写 Auth 页和 Server Component CRUD；之后部署到 Vercel 时把三个 SUPABASE_* 环境变量配好 + 在 Auth Redirect URLs 加上 Vercel 域名

### LongCut 项目实际使用的 12 个 Supabase 功能点速查

| # | 功能 | 文档章节 |
| --- | --- | --- |
| 1 | Supabase Auth | 三 §8 步骤六 |
| 2 | 内置邮件服务 | 三 §8 步骤六（邮件确认说明） |
| 3 | Postgres 数据库 | 三 §7 步骤五 + §9 步骤七 |
| 4 | RLS 行级安全 | 一 §核心能力 + 三 §7 + §12 验证清单 |
| 5 | RPC 存储过程 | 三 §7 步骤五（`increment_notes_count`） |
| 6 | Database Triggers | 三 §7 步骤五（`handle_new_user`） |
| 7 | `@supabase/ssr` SSR 集成 | 三 §6 步骤四 |
| 8 | Service Role 客户端 | 三 §6 步骤四 + §10A 进阶 |
| 9 | pg_cron 定时任务 | 三 §10B 进阶 |
| 10 | pg_net DB 内 HTTP | 三 §10B 进阶 |
| 11 | Supabase Vault | 三 §10C 进阶 |
| 12 | `auth.uid()` 内置函数 | 三 §7 步骤五 RLS 策略中 |

### 未集成功能（何时需要时再启用）

- **Storage**：要存用户上传文件（头像 / 附件）时启用
- **Realtime**：需要协同编辑、即时通知、聊天等功能时启用
- **Edge Functions**：需要在 Supabase 网络内跑业务逻辑（如 Stripe webhook + 直接写库）时启用
- **pgvector**：做语义搜索 / RAG / 推荐系统时启用
