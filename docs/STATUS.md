# Wholesale Scout: status

Read this first in a new session. Keep it current: every commit that changes a feature updates
it (what's built, the backlog, the rough edges). Last updated: 2 Oct 2026 (Stock workspace,
anonymised StockPilot sample).

Wholesale Scout is a single-user Amazon UK seller's workbench: Next.js 16 (App Router, `proxy.ts`
password gate), Supabase (Postgres, RLS on, service-role access from the server only), Vercel
hosting, a Chrome extension (`extension/`, 0.3.0), and the Help centre in `content/help`. It has
four workspaces (switch at the top of the sidebar, Alt+Shift+W); Home, Settings and Help are
shared.

## Workspaces

**Wholesale: resell existing listings.** Supplier price lists (CSV/XLSX upload, column mappings
remembered per supplier, Qogita pulled nightly) are screened against Keepa and SP-API in
background runs: gates (compliance, gating, Amazon, sellers, demand, price), a score and a verdict,
with the fee engine on the active rate card, hurdle prices and first-order quantities. Pages: Runs
(results table, filters, drawer), Upload, Check ASINs, Qogita, Sellers (storefront scans), Brands,
Suppliers (a ledger with terms, VAT basis, MOV, ratings), Favourites, Watchlist (weekly re-checks,
email alerts), Plan (an order plan per supplier from offers), Hunt (Keepa Product Finder for
wholesale), Products, and Tracker (purchases with the app's prediction frozen at purchase,
compared with Amazon's orders, FBA stock and fee estimates from the nightly SP-API sync; stock-item
purchases, Received into a Stock bucket). The extension shows the verdict on product and search
pages, reads competitor stock on request, looks up dangerous goods in Seller Central, captures
Opportunity Explorer niches and runs manual rank checks.

**Private label: launch your own product.** Candidates are scored through Gatekeeper's eight gates,
a 10-line scorecard and a verdict, with Keepa filling Gates 0–2, Opportunity Explorer captures
(via the extension) filling Gates 3 and 5, the fee engine Gate 6, ads-per-unit derived from the
Ads CPC, and waivers per check or gate. Niche Hunt finds niches that already pass Gates 0–1: Direct
mode (one filtered Product Finder query per category, then detail grouped by leaf, an incumbent
check per niche with 3+ qualifying, off-niche incumbents by Keepa category) and Leaf mode (size
each leaf, then detail), with a hard token cap (estimate + 10%). Quotes turns supplier quotes into
a landed cost per unit and total cash (FX, freight, duty, import VAT, inspection), writes it into
Gates 0 and 7, chooses a supplier and generates the RFQ. Launch is a 12-step checklist (samples to
first review) moving the status, a budget tracker against Gate 7, and a listing ASIN that links
the candidate to its Ads product and stock item.

**Ads: run and tune Sponsored Products.** Data comes from files until the Ads API is approved: the
bulk export (.xlsx, primary: campaigns, placements, ad groups, product ads, keywords, negatives,
targets, search terms with the matching keyword) and CSV reports (search term, campaign, the
Campaign Manager grid, daily Campaign and Placement reports). The dashboard is product-first
(tiles, break-even ACoS, profit after ads, days of cover, launch plan, campaigns with placements,
keywords with organic rank sparklines, search terms), with campaigns assigned or archived at the
bottom. Thirteen rules (harvest, negatives, bids, pause, placement, budget, revive, n-gram
negative/winner, stock guard, ranked, slipping) raise proposals to approve, skip or snooze; the
approved export as a bulk sheet in Amazon's own column order, as batches that can be reverted,
with snapshots to restore. Also: n-grams, the launcher (Auto/Broad/Exact/PT Create sheet and a
60-day plan), extension rank checks.

**Stock: track what you hold.** Your own items (stock_items) in three buckets: self-ship and TikTok
FBT are ledgers of movements (received, sale, return, adjustment, transfer); Amazon FBA is SP-API's
fulfillable count and Amazon sales come from the orders sync, never typed. Pages: Levels (items ×
buckets, value at cost, days of cover, status, an item drawer with actions), Movements (filters,
CSV export), Sales (non-Amazon channels, stock-checked, cost snapshot at sale), Reorder ((lead time
+ buffer) × daily demand, 30 days' quantity, Create purchase → Tracker), Import (StockPilot's raw
table export or an items CSV, previewed, idempotent). The pill box account's StockPilot data is
imported (3 items). Ads days of cover and the stock guard count every bucket.

## External dependencies

| Service | State |
|---|---|
| **Keepa** | Live. About 21 tokens a minute refill; spend is logged per feature (Home's Keepa tile). Token-conscious: estimate before spending, report what was spent. |
| **SP-API** | Live: orders report, FBA inventory (getInventorySummaries), catalog, fee estimates, listing restrictions, offers. Nightly sync plus on demand. The **Brand Analytics** and **Finance** roles are approved but the token still gets 403: no Buy Box %, no exact fees charged (the fee estimate stands in). Retry later. |
| **Amazon Ads API** | **Pending approval.** LWA client credentials are in the env (`ADS_LWA_CLIENT_ID`, `ADS_LWA_CLIENT_SECRET`); no connector yet (backlog). Until then: bulk export in, bulk sheet out. |
| **Anthropic API** | `ANTHROPIC_API_KEY` is set; the app doesn't call it yet. |
| **Supabase** | Postgres with RLS on every table; pg_cron + pg_net run the watchdog (restarts stalled runs and hunts). |
| **Vercel** | Hosting; crons: Qogita nightly 03:00, Watchlist Sunday 06:00. Env vars set there (Sensitive), including Qogita and `SPAPI_SELLER_ID`. |
| **Qogita** | Live: nightly catalogue and offer pull. |
| **Resend** | Watchlist alert emails, sent only when `RESEND_API_KEY` and `ALERT_EMAIL_TO` are set (not set locally). |

## Backlog (priority order)

1. **Ads: Phase 4, research layer** (keyword and competitor research feeding the rules and the launcher).
2. **Ads: Phase 3, the Ads API connector**, once approved: pull reports and entities, apply approved proposals (rules in Auto mode), hourly data for budget timing, impression share, keyword-level days.
3. **Private label: Gate 4 reviews helper** (mine the 1–3★ reviews of the top listings for the fixable complaint).
4. **Stock: TikTok/eBay sales recording in use** (record real sales so demand, cover and reorder points mean something; a faster entry path or imports from TikTok Shop/eBay order exports).
5. **General: move pg_net out of the public schema** (Supabase advisor: extension in public).
6. **General: Resend email alerts** configured in Vercel and extended beyond the Watchlist (stock low/out, reorder due, stock guard, hunt finished).
7. **General: data backup workflow** (only the schema is backed up today, to `supabase/schema.sql`; data relies on Supabase's own backups).

## Known rough edges

- **Ads bulk sheets haven't been uploaded to Amazon yet**: the format follows Amazon's export column for column, but acceptance is unproven until the first upload. Batch "2026-10-02 #1" (7 proposals) waits to be uploaded. Batch "2026-10-02 #3" (the dog seat belt 2-pack launch) has the SKU `REPLACE-WITH-2PACK-SKU`: re-create it on Ads → Launch with the real SKU (and the 2-pack's own ASIN once it exists); B0H9ZH3RV5 is in its launch phase because of it.
- **Daily Ads reports** are parsed against a sample in Amazon's format: the first real daily Campaign/Placement export confirms the column names.
- **Bid up, Budget, Revive** need the daily Campaign report imported; impression share, hourly budget timing and keyword-level days need the Ads API.
- **Keepa's salesRankDrops** undercounts fast sellers: Niche Hunt's direct mode filters on monthlySold instead, and the incumbent check costs about 31 tokens a niche (the finder returns ASINs only).
- **Off-niche incumbents** use Keepa's category; a few borderline products (filed elsewhere but near the niche) are excluded.
- **Products** loads 50 a page from the server: a column sort orders only the loaded page.
- **Gate 7's stock line** from a quote is units × the rounded landed cost per unit (pennies off the quote's total).
- **Stock** demand for the pill box is thin: no Amazon orders after 13 Sept in the sync, 0 FBA units, and no TikTok/eBay sales recorded yet.
- **The StockPilot app** still runs against its own Supabase project; a Dyad chat log on disk (`~/dyad-apps/StockPilot/.dyad/chats/44/…`, gitignored) holds its old project's anon key in plain text.
- **SP-API roles** (Brand Analytics, Finance): see above.

## Conventions for every session

- **Read this file first**, and `AGENTS.md`: this is Next.js 16 (read `node_modules/next/dist/docs/` before writing Next code; `proxy.ts` not middleware; route params are a Promise).
- **After every commit, `git push origin main`** and report the commit hash with "pushed". If the push is rejected: `git pull --rebase origin main`, re-run `npm test`, push again.
- **Never push with failing tests or a failing build** (`npm test`, `npm run lint`, `npm run build`).
- **Migrations**: a new file in `supabase/migrations/` (`YYYYMMDDhhmmss_name.sql`), run with `npm run migrate` (never ask the user to paste SQL), then `npm run schema:backup`, all before pushing.
- **RLS on every new table**, and `revoke all … from anon, authenticated` (the server uses the service role).
- **Never commit `.env.local`** or any secret; never print `DATABASE_URL`, tokens or keys (names only).
- **Report token costs**: estimate Keepa spend before a run and say what was spent after; don't spend tokens on checks the data already answers.
- **Update `docs/STATUS.md`** in every commit that changes features.
- **Every top-level page has a Help article** (the coverage test enforces it); new data tables sort through `useSortable`/`SortTh` (`src/components/SortableTable.tsx`).
- **Don't touch `scripts/.b.mjs`** (the user's).
