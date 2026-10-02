@AGENTS.md

**Read `docs/STATUS.md` first**: what's built in each workspace, the external dependencies, the backlog, the rough edges and the conventions.

## Workflow

- Update `docs/STATUS.md` in every commit that changes features (what's built, backlog, rough edges).
- After every commit in this repo, run `git push origin main` immediately, and in the report confirm the push succeeded with the commit hash and "pushed".
- If the push is rejected, run `git pull --rebase origin main`, re-run the tests (`npm test`), and push again.
- When the commit includes a migration (`supabase/migrations/`), run `npm run migrate` before pushing.
- Never push with failing tests or a failing build (`npm test`, `npm run build`).
- Never commit `.env.local` (or any other env file holding secrets).
