@AGENTS.md

**Read `docs/STATUS.md` first**: what's built in each workspace, the external dependencies, the backlog, the rough edges and the conventions.

## Workflow

- Update `docs/STATUS.md` in every commit that changes features (what's built, backlog, rough edges).
- After every commit in this repo, run `git push origin main` immediately, then `make deploy` (builds and restarts the app on the Netcup server; Vercel is no longer used). In the report confirm the push succeeded with the commit hash and "pushed", and that the deploy ended with "==> up".
- If the push is rejected, run `git pull --rebase origin main`, re-run the tests (`npm test`), and push again.
- When the commit includes a migration (`supabase/migrations/`), run `make migrate` before pushing (applies it to the server's database over an SSH tunnel; `npm run migrate` alone will not reach it).
- Never push with failing tests or a failing build (`npm test`, `npm run build`); after UI changes also `npm run test:a11y` (axe and the phone checks on every route, against the build; stop the dev server first).
- Never commit `.env.local` (or any other env file holding secrets).
- Disk: `npm run clean` removes `.next`, `test-results` and `playwright-report` (rebuild before `npm run test:a11y`). Turbopack's dev cache has no size limit, so `predev` (`scripts/dev-cache-cap.mjs`) clears `.next/dev` once it's over 3 GB (`DEV_CACHE_MAX_GB` to change). Screenshots under `docs/ui-audit/` are local only (gitignored); don't commit images there.
- Never print credentials in command output: no `curl -v`, `-i`, `-D -` or `-L` output on requests that carry Basic auth or a bearer token, and no echoing of `.env` values. Check with `curl -s -o /dev/null -w '%{http_code} %{redirect_url}'` and strip any userinfo from the URL before it's shown (`| sed -E 's#//[^/@]*@#//#'`): curl puts the `-u` user and password into `%{redirect_url}`.

## Hosting

The app runs on the Netcup server (https://ws.dgr8cali.co.uk) with self-hosted Supabase (https://db.dgr8cali.co.uk), not Vercel/Supabase Cloud. Server files: `infra/`. Secrets live in `~/wholesale-scout/.env` on the server (not in the repo). See `infra/env.server.example`.
