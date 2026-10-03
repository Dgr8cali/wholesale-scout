# Wholesale Scout: status

Read this first in a new session. Keep it current: every commit that changes a feature updates
it (what's built, the backlog, the rough edges). Last updated: 3 Oct 2026 (Stock: editing and deleting).

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
Suppliers (a ledger with terms, VAT basis, MOV, ratings, a type: manufacturer / wholesaler /
marketplace seller / retailer, filters by type and Stock only, and each supplier's stock items,
orders and receipts), Favourites, Watchlist (weekly re-checks,
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
Gates 0 and 7, chooses a supplier and generates the RFQ. Gate 4's review miner takes pasted 1–3★ reviews per top-5 ASIN (`pl_review_dumps`), splits
them, counts complaint phrases locally (stop words, bigrams/trigrams, an editable synonym list) into a
sortable Themes table, and the theme you pick fills the gate's share and a draft six words; an
optional Claude summary runs only on a click. Launch is a 12-step checklist (samples to
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
60-day plan), extension rank checks. The AI research layer (Claude, on your click only): Explain this product (a cited
narrative per product), Recommend targets (launch and steady ACoS, Apply writes them) and the
monthly review on Ads → Review (per product, account-wide, did applied batches work, three ranked
recommendations mapped to rules; optional schedule on the 1st, off by default). Every call is
logged in `ads_ai_calls` with tokens and £ cost; answers are cached per data hash.

**Stock: track what you hold.** Your own items (stock_items) in three buckets: self-ship and TikTok
FBT are ledgers of movements (received, sale, return, adjustment, transfer); Amazon FBA is SP-API's
fulfillable count and Amazon sales come from the orders sync, never typed. Pages: Levels (items ×
buckets, value at cost, days of cover, status, an item drawer with actions), Movements (filters,
CSV export), Sales (non-Amazon channels, stock-checked, cost snapshot at sale), Reorder ((lead time
+ buffer) × daily demand, 30 days' quantity, Create purchase → the order form), Import (StockPilot's raw
table export or an items CSV, previewed, idempotent). Record a new order (Levels, and the Tracker): item and
supplier picked or added inline, quantity, unit cost in any currency at a rate, the supplier's
order id and link, ordered/expected dates, tracking; it sits in the Tracker as Ordered and
Receive (the item drawer or the Tracker) puts it into a bucket as a receipt carrying the order.
+ New supplier on the item form, drawer, Receive and the order form. Correcting mistakes: edit or delete
any movement (a sale takes its sale, a transfer both halves, a receipt puts its order back to
Ordered), delete sales, open orders and listings, archive / restore / delete permanently items, bulk
delete and archive, red "negative" chips where a bucket goes below 0, and an audit log
(`stock_audit`, Movements → Audit log). The pill box account's
StockPilot data is imported (3 items). Ads days of cover and the stock guard count every bucket.

## External dependencies

| Service | State |
|---|---|
| **Keepa** | Live. About 21 tokens a minute refill; spend is logged per feature (Home's Keepa tile). Token-conscious: estimate before spending, report what was spent. |
| **SP-API** | Live: orders report, FBA inventory (getInventorySummaries), catalog, fee estimates, listing restrictions, offers. Nightly sync plus on demand. The **Brand Analytics** and **Finance** roles are approved but the token still gets 403: no Buy Box %, no exact fees charged (the fee estimate stands in). Retry later. |
| **Amazon Ads API** | **Pending approval.** LWA client credentials are in the env (`ADS_LWA_CLIENT_ID`, `ADS_LWA_CLIENT_SECRET`); no connector yet (backlog). Until then: bulk export in, bulk sheet out. |
| **Anthropic API** | Live (`@anthropic-ai/sdk`): Ads Explain, Recommend targets and the monthly review, Private label's review summary, only on a click or the monthly schedule (off by default). Model and prices in Settings → Ads (Sonnet 5.5 default); cost per call logged in `ads_ai_calls`. |
| **Supabase** | Postgres with RLS on every table; pg_cron + pg_net run the watchdog (restarts stalled runs and hunts). |
| **Vercel** | Hosting; crons: Qogita nightly 03:00, Watchlist Sunday 06:00, Ads review 1st of the month 06:00 (does nothing unless turned on). Env vars set there (Sensitive), including Qogita and `SPAPI_SELLER_ID`. |
| **Qogita** | Live: nightly catalogue and offer pull. |
| **Resend** | Watchlist alert emails, sent only when `RESEND_API_KEY` and `ALERT_EMAIL_TO` are set (not set locally). |

## Backlog (priority order)

1. **Ads: Phase 3, the Ads API connector**, once approved: pull reports and entities, apply approved proposals (rules in Auto mode), hourly data for budget timing, impression share, keyword-level days.
2. **Ads: keyword and competitor research** (the old Phase 4 idea: feeding the rules and the launcher; the AI layer now covers narrative, targets and the monthly review).
3. **Stock: TikTok/eBay sales recording in use** (record real sales so demand, cover and reorder points mean something; a faster entry path or imports from TikTok Shop/eBay order exports).
4. **General: move pg_net out of the public schema** (Supabase advisor: extension in public).
5. **General: Resend email alerts** configured in Vercel and extended beyond the Watchlist (stock low/out, reorder due, stock guard, hunt finished).
6. **General: data backup workflow** (only the schema is backed up today, to `supabase/schema.sql`; data relies on Supabase's own backups).

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
- **AI prices are assumed defaults** ($3/$15 per M tokens for Sonnet 5.5, $1/$5 Haiku 4.5, $5/$25 Opus 5.5, £0.79 per $): check them against Anthropic's pricing and edit in Settings → Ads.
- **The monthly review** needs the daily Campaign report for per-month figures and batch before/after verdicts; with range data only it says so. No batch has been uploaded yet, so no verdict has been tested on real data.
- **The review miner** has no part-of-speech tagger: phrases are content-word pairs and triples after stop words, so a few odd ones ("too easily") show; Ignore hides them. Tested on a fixture of 40 fake reviews; the first real Amazon paste confirms the splitting.
- **Stock audit** records "you" as the actor: the app has one user behind the password gate, so it doesn't tell people apart.
- **Order currency** is for reference once recorded: the landed cost per unit stays in £ (worked out at the rate when the order is recorded); editing the rate later doesn't change it.
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
