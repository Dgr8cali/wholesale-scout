---
title: Add an environment variable
summary: Every environment variable the app reads, what it does, and how to set it locally and on Vercel.
synonyms: [env, env var, secret, api key, configuration, vercel, env.local, credentials]
order: 7
---
Keys and passwords (Supabase, Amazon SP-API, Keepa, Qogita, email) aren't stored in the app's database or code. They're environment variables: set in `.env.local` on your computer, and in the Vercel project for the live app.

## Set one locally

1. Open `.env.local` in the project's root folder (create it if it isn't there). It is not committed to git.
2. Add one line per variable, `NAME=value`, with no spaces around `=`:

   ```
   KEEPA_API_KEY=your-key-here
   ```

3. Stop `npm run dev` and start it again. The app only reads the file when it starts.

`npm run migrate` reads `.env.local` too, for `DATABASE_URL`.

## Set one on Vercel

1. In Vercel, open the project, then **Settings** → **Environment Variables**.
2. Enter the name and value, choose the environments (Production, and Preview if you use it), and save.
3. Redeploy: **Deployments** → the latest deployment → **Redeploy**. A running deployment doesn't see new or changed variables until it is redeployed.

## Check it worked

The status dots in the top bar show **Supabase**, **SP-API**, **Gating** and **Keepa**. Hover a red one for the variable it wants, e.g. "Set SPAPI_SELLER_ID (your merchant token) for gating checks". The status check reports only whether each is set, never the values.

## Every variable the app reads

### Required

| Variable | What it's for |
|---|---|
| `SUPABASE_URL` | Your Supabase project's URL. Without it and the key, every page that loads data fails with "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set". |
| `SUPABASE_SERVICE_KEY` | Supabase's service-role key, used by the server only. |
| `APP_PASSWORD` | The password the browser asks for (any username). The extension and scripts send it as a bearer token. In production, without it every page says "Set APP_PASSWORD in the Vercel project to open Wholesale Scout."; locally the app runs open. |

### Amazon SP-API

| Variable | What it's for |
|---|---|
| `SPAPI_CLIENT_ID` | Your SP-API app's LWA client ID. All three of these are needed for any Amazon data (catalogue match, dimensions, fees, offers). |
| `SPAPI_CLIENT_SECRET` | The LWA client secret. |
| `SPAPI_REFRESH_TOKEN` | The refresh token from authorising the app on your seller account. |
| `SPAPI_SELLER_ID` | Optional but needed for gating: your merchant token. Without it the [Gating and blocks](/help/gates/gating) gate is skipped ("Set SPAPI_SELLER_ID to check gating"). |
| `SPAPI_MARKETPLACE_ID` | Optional. Defaults to Amazon UK (`A1F83G8C2ARO7P`). |
| `SPAPI_ENDPOINT` | Optional. Defaults to the EU endpoint, `https://sellingpartnerapi-eu.amazon.com`. |

### Keepa

| Variable | What it's for |
|---|---|
| `KEEPA_API_KEY` | Your Keepa key (64 letters and digits). Without a real key the app uses a stub and the history gates are skipped. See [Keepa tokens](/help/concepts/keepa-tokens). |
| `KEEPA_MODE` | Optional. Set to `stub` to use the stub even when a key is set. |

### Qogita

| Variable | What it's for |
|---|---|
| `QOGITA_EMAIL` | Your Qogita login. With the password, it lets the app pull from Qogita on the [Qogita](/help/pages/qogita) page and in the nightly pull, and add to your Qogita cart. |
| `QOGITA_PASSWORD` | Your Qogita password. |

### Scheduled jobs

| Variable | What it's for |
|---|---|
| `CRON_SECRET` | Lets Vercel Cron call `/api/cron/…` without the app password. Needed for the nightly Qogita pull (03:00) and the weekly watchlist check (Sunday 06:00); without it those calls are refused. |
| `WATCHDOG_SECRET` | Optional. The bearer secret Supabase's watchdog job uses to call `/api/cron/watchdog`, which restarts runs that have stalled. The same value goes in Supabase Vault as `watchdog_secret`, with the app's watchdog address as `watchdog_url`. `CRON_SECRET` is accepted there too. |

### Email alerts

| Variable | What it's for |
|---|---|
| `RESEND_API_KEY` | Your Resend API key. With `ALERT_EMAIL_TO`, [watchlist](/help/pages/watchlist) alerts are emailed; without both, alerts stay on the Watchlist page. |
| `ALERT_EMAIL_TO` | Where alerts go. Several addresses can be separated by commas. |
| `ALERT_EMAIL_FROM` | Optional. The sender. Defaults to `Wholesale Scout <onboarding@resend.dev>`, which only delivers to your own Resend account's address until you verify a domain. |
| `APP_URL` | Optional. The app's address used in email links. Falls back to Vercel's production address, then `https://wholesale-scout.vercel.app`. |

### Database migrations

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | The Postgres connection string for `npm run migrate` (Supabase → **Connect** → Session pooler). Only the migration script uses it; set it in `.env.local`. |

### Set for you

`NODE_ENV` (set by Next.js) and `VERCEL_PROJECT_PRODUCTION_URL` (set by Vercel) are read by the app, but you don't set them.

## Keep secrets secret

Never paste keys into help articles, issues, chat or commits. `.env.local` stays on your computer; Vercel keeps its copy encrypted. If a key leaks, make a new one at the provider, update it in both places and redeploy.
