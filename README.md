# VidInsight

Turn any YouTube video into a study workbench: transcript, AI highlights, citation-grounded chat, and notes.

## Stack

- Next.js 15 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind 4 + Radix UI primitives + sonner
- Supabase (Auth + Postgres) via `@supabase/ssr`
- AI: **MiniMax** (single provider; adapter layer keeps room for future ones)
- Transcripts: YouTube InnerTube (Android / Web / iOS) → Supadata fallback
- Hosting: Vercel (Edge middleware, Analytics, Cron)

## Quickstart

```bash
cp .env.local.example .env.local      # fill in Supabase + MiniMax + Supadata keys
npm install
supabase db push                       # apply migrations under supabase/migrations
npm run dev
```

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `MINIMAX_API_KEY` (default model `MiniMax-M2.7`)
- `SUPADATA_API_KEY` (transcript fallback)
- `CRON_SECRET` (Vercel Cron auth for `/api/cron/cleanup-rate-limits`)

Set `NEXT_PUBLIC_APP_URL` only in production. Leave it blank for Vercel Preview deployments — `resolveAppUrl()` will pick up `VERCEL_URL` automatically.

## Routes

- `/` Landing
- `/analyze/[videoId]` Two-column workbench
- `/v/[slug]` SEO share page
- `/my-videos`, `/all-notes`, `/settings` Authenticated
- `/api/*` JSON APIs (most state-changers go through `withSecurity`)

## Deployment

Push to a Vercel project; the included `vercel.json` sets per-route `maxDuration` and a daily Cron to prune `rate_limits`. Configure Supabase Auth → "Redirect URLs" to include `https://*.vercel.app/auth/callback` so previews can complete OAuth.

## License

UNLICENSED — internal project.
