# Wholesale Scout

Amazon UK wholesale research: supplier price lists, Qogita pulls, ASIN checks, seller scans and
Keepa hunts in; a screened, scored shortlist and an order out.

Next.js 16 (app router), TypeScript, Tailwind 4, Supabase Postgres + Storage, Vercel. How to use
the app is in the app itself: **Help** in the sidebar (articles in `content/help/`). This file is
the setup guide for a fresh clone.

## 1. Services you need

| Service | For | Required |
| --- | --- | --- |
| Supabase project | Database (Postgres), file storage (documents) | yes |
| Vercel project | Hosting, crons | yes (or any Node host for local use) |
| Amazon SP-API app (UK) | Catalog match, Buy Box, offers, fees, gating | yes, for real screening |
| Keepa API key | Sales history, Product Finder (Hunt), seller storefronts | recommended |
| Qogita buyer account | Qogita pulls, cart, Find on Qogita | optional |
| Resend | Watchlist email digest | optional |

## 2. Clone and install

```
git clone <repo> && cd wholesale-scout
npm ci            # versions are pinned (package.json + package-lock.json, .npmrc save-exact)
cp .env.example .env.local   # then fill it in (see below)
```

Node 20 or later.

## 3. Environment variables

Set these in Vercel → Settings → Environment Variables (Production, and Preview if you use it),
and in `.env.local` for local work (`vercel env pull .env.local` fetches the Development ones).
After changing one in Vercel, redeploy. Never commit `.env.local`.

| Variable | What it's for | Required |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Every database and storage call. Only the service key is used, server-side: RLS is on with no policies. | yes |
| `DATABASE_URL` | `npm run migrate` and the schema backup (Supabase → Connect → Session pooler URI). Local only; the app doesn't use it. | for migrations |
| `APP_PASSWORD` | The password gate (browser asks once, any username; scripts and the extension send `Authorization: Bearer <password>`). Production refuses to serve without it. | yes |
| `SPAPI_CLIENT_ID`, `SPAPI_CLIENT_SECRET`, `SPAPI_REFRESH_TOKEN` | SP-API (LWA app credentials and the refresh token from authorising it on your seller account). | yes |
| `SPAPI_SELLER_ID` | Gating checks: your merchant token (Seller Central → Settings → Account Info). | for gating |
| `SPAPI_MARKETPLACE_ID`, `SPAPI_ENDPOINT` | Override the UK marketplace (`A1F83G8C2ARO7P`) and EU endpoint. | no |
| `KEEPA_API_KEY` | Keepa (64 characters). Anything else keeps the stub, where history gates say "not checked"; `KEEPA_MODE=stub` forces it. | recommended |
| `QOGITA_EMAIL`, `QOGITA_PASSWORD` | Qogita pulls, the cart, Find on Qogita. | optional |
| `RESEND_API_KEY`, `ALERT_EMAIL_TO` | Watchlist digest email. | optional |
| `ALERT_EMAIL_FROM`, `APP_URL` | Sender and the link base in that email (defaults: Resend's test sender, the Vercel production URL). | no |
| `CRON_SECRET` | Vercel sends it to the crons (`/api/cron/*`). Vercel sets it when you add one; the routes refuse other callers. | for crons |
| `WATCHDOG_SECRET` | The Supabase watchdog's bearer token (see 5). | for the watchdog |

The help article **Add an environment variable** lists the same with more detail.

## 4. Database

```
npm run migrate                    # applies supabase/migrations/*.sql in order, each once
npm run migrate -- --status        # what's applied and pending
```

Every migration is safe to re-run. On first use the app seeds the four profiles (First order is
the default), the compliance rules and the July 2026 rate card. Migrations also create the
private Storage bucket `documents`.

Back up the schema with `npm run schema:backup`: it writes `supabase/schema.sql` (tables,
constraints, indexes, functions, triggers, RLS, the storage bucket, the watchdog schedule and the
applied migrations; no data, no secrets). `npm run schema:restore -- --check` proves the dump
rebuilds every table in an empty scratch schema and rolls back. To restore, point
`RESTORE_DATABASE_URL` (or `DATABASE_URL`) at the target and run `npm run schema:restore`: one
transaction, it only creates what's missing and asks first. Data backups are Supabase's (daily
on paid plans; Database → Backups).

## 5. Crons and the watchdog

- **Vercel crons** (`vercel.json`): Qogita nightly re-pulls at 03:00 UTC, the watchlist re-check on
  Sundays at 06:00 UTC. They need `CRON_SECRET`.
- **Watchdog** (Supabase `pg_cron`, every minute, created by a migration): restarts a run whose
  processing chain has died, so runs finish with no browser open. It reads two Supabase Vault
  secrets; add them once in the SQL editor:

  ```sql
  select vault.create_secret('https://<your-app>/api/cron/watchdog', 'watchdog_url');
  select vault.create_secret('<same value as WATCHDOG_SECRET>', 'watchdog_secret');
  ```

  Without them the job does nothing.

Functions run in Dublin (`dub1`, `vercel.json`), next to a Supabase project in eu-west-1. If your
project is elsewhere, set `regions` to the Vercel region nearest to it.

## 6. The Chrome extension

`extension/` is a Manifest V3 extension, loaded unpacked: `chrome://extensions` → Developer mode
→ Load unpacked → the `extension/` folder. In its popup set the app URL and `APP_PASSWORD`, Save,
then Test connection. Details in `extension/README.md` and the help article **Set up the Chrome
extension**.

## Rate limits

`src/proxy.ts` and `src/lib/server/rateLimit.ts`: 10 wrong passwords from one address in 15
minutes block it for 15 minutes (counted in the database table `auth_failures`, so every
instance sees it; the right password is refused while blocked). The extension API allows 60 checks
and 120 other requests a minute per address (counted per server instance).

## 7. Commands

```
npm run dev              # local app on http://localhost:3000
npm test                 # unit and pipeline tests (Vitest)
npm run typecheck
npm run lint
npm run build            # runs the help-centre check first: every page and gate needs an article
npm run migrate          # apply pending migrations
npm run schema:backup    # dump the schema to supabase/schema.sql
npm run schema:restore   # apply supabase/schema.sql to an empty database (asks first)
```

## 8. Where things live

| Path | What |
| --- | --- |
| `src/app/` | Pages and API routes (`api/`) |
| `src/components/` | UI; `ui/` is the shadcn kit |
| `src/lib/screening/` | Profiles and defaults, compliance rules, the twelve gates, the score |
| `src/lib/fees/` | Rate card and fee engine |
| `src/lib/spapi/`, `src/lib/keepa/`, `src/lib/qogita/` | API clients and their parsers |
| `src/lib/server/` | Database access, ingest, the run processor, everything server-only |
| `src/proxy.ts` | The password gate and rate limits |
| `content/help/` | Help centre articles (markdown) |
| `supabase/migrations/` | Schema, in order |
| `scripts/` | Migrations, schema backup and restore |
| `extension/` | The Chrome extension |
