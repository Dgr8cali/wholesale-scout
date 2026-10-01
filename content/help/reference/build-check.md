---
title: Build check
summary: What has to pass before a change ships (tests, the help centre's coverage, the build), the database checks behind it, and the backlog of known follow-ups.
synonyms: [build, deploy, ci, prebuild, checks, backlog, supabase advisor, security advisor]
order: 2
---
Every change goes through the same checks before it's pushed, and Vercel deploys `main` once it is.

## What the build runs

| Step | Command | What fails it |
|---|---|---|
| Help coverage | `npm run build` runs `vitest run src/lib/help` first (prebuild) | A page or gate with no article, no article for the Chrome extension, or a `/help/…` link to an article or heading that doesn't exist. |
| Build | `next build` | A type error, or a page or route that won't compile. |
| Tests | `npm test` | Any failing test. Never pushed while one fails. |
| Lint | `npm run lint` | Lint errors. |

When a change includes a database migration (`supabase/migrations/`), it is applied with `npm run migrate` before the push, so the deployed code never meets a database without its columns. After a schema change, `npm run schema:backup` refreshes `supabase/schema.sql`.

## Database security

Supabase's security advisor is kept clear:

- **Row level security** is on for every table in `public`, with no policies. The app reaches the database only with the server's service-role key and `DATABASE_URL`. The public API roles (anon, authenticated) are granted nothing on tables, sequences or functions, now or by default. The anon key gets "permission denied".
- **Function search path**: every function in `public` pins its `search_path` (`public, pg_temp`; the watchdog uses `public, extensions` for pg_net). A function written in a new migration should include `set search_path = public, pg_temp`.

## Backlog

Known follow-ups, not yet done:

- **Move pg_net to the extensions schema.** The advisor flags pg_net installed in `public`. It's left there for now because the watchdog (`wholesale_scout_watchdog`, run every minute by pg_cron) calls `net.http_get`. Moving it means reinstalling the extension in `extensions` and checking the watchdog still reaches the app afterwards.
