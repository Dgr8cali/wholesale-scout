# Wholesale Scout: status

Read this first in a new session. Keep it current: every commit that changes a feature updates
it (what's built, the backlog, the rough edges). Last updated: 20 Oct 2026 (UI redesign phase 4c: one results table for wholesale products).

Wholesale Scout is a single-user Amazon UK seller's workbench: Next.js 16 (App Router, `proxy.ts`
password gate), self-hosted Supabase (Postgres, RLS on, service-role access from the server only),
hosted on the Netcup server at https://ws.dgr8cali.co.uk (`infra/`, `make deploy`), a Chrome extension (`extension/`, 0.8.0), and the Help centre in `content/help`. It has
four workspaces, each a labelled group in one sidebar (main pages, then a collapsible More); Today
(Home), Settings and Help are shared.

**Hosting cutover, closed out** (19 Oct 2026): the app moved from Vercel + Supabase Cloud to the Netcup server on 17 Oct (cutover dump 06:28:33 BST), but wholesale-scout.vercel.app kept running against Supabase Cloud and was used by mistake on 17 Oct evening. A read-only three-way diff (the cutover dump restored locally vs Cloud vs self-hosted, every table, by primary key and row content) found Cloud-only: two Private label candidates ("Electrolyte sachets", "Women's probiotic") with their ASINs, fields, waivers, review dumps, POE snapshots, niches and hunt ASINs; two AI review summaries (£0.052); the deletion of three draft candidates (tackle box, raised dog bowl, cat water fountain); and the Vercel crons' Qogita nightlies (18, 19 Oct), Watchlist re-check (18 Oct) and an ASIN check. All of it was copied into self-hosted in one transaction (IDs kept, foreign-key order), after a backup (`~/backups/supabase-pre-merge-20261019T145918.dump` on the server); the brand map was rebuilt there, not copied. Kept self-hosted on conflicts: Amazon sync data (same values both sides), one proposal's refresh time. The re-run diff shows Cloud ⊆ self-hosted. All the Ads launch work (B0HM8FBX3T's "2026-10-18 #1", uploaded; "2026-10-02 #3" discarded) was on self-hosted all along. Supabase Cloud is untouched, as the rollback. To stop it recurring: `vercel.json` now 308-redirects every path to https://ws.dgr8cali.co.uk and has no crons, and `proxy.ts` redirects any `*.vercel.app` host as a backstop; the extension's default App URL is the server and a saved vercel.app address is moved to it. The server's crons had failed since the cutover (`.cron.env` held the secret unquoted and still `$$`-escaped): fixed, and both run by hand returned JSON. The server's `.env` has every key the Vercel environment pull had; missing: `RESEND_API_KEY`, `ALERT_EMAIL_TO` (email alerts off) and optionally `ALERT_EMAIL_FROM`.

**Logo** (18 Oct 2026): the master mark is `public/logo.svg` (teal tile, magnifier, amber bars), drawn by `<Logo size>` (`src/components/Logo.tsx`, alt "Wholesale Scout") in the sidebar header, the Help centre header, and as the default mark of an `EmptyState` given no icon. Favicon and app icons by Next's file conventions: `src/app/favicon.ico` (16/32/48), `icon.svg`, `apple-icon.png` (180, full-bleed teal: iOS rounds it), and `manifest.ts` (Wholesale Scout / Scout, theme #2F7F8C, `public/icon-192.png` and `icon-512.png`). The proxy serves those files without the password (a browser fetches the manifest without credentials). The extension (0.6.0 on) uses the same mark: `extension/icons/` 16/32/48/128 for its icon and toolbar button, the popup's heading, and a 16 px mark in every panel heading (built as SVG nodes, so no page's CSP blocks it). There's no login page to put it on: the password is the browser's own Basic-auth dialog.

**UI redesign** ("Calm Workbench", from `docs/ui-audit.md`). Phase 1, the audit, done (19 Oct 2026). Phase 2, foundations, done (19 Oct 2026):
tokens in `src/app/globals.css` (one source of truth: the logo teal #2F7F8C as primary with hover/soft/ink, the amber #F2B544 as
`highlight` (shadcn's `accent` stays the hover surface), warn/danger/success soft+ink pairs, light and dark; the old names
pass/warn/fail/empty, brand, surface-2, ink-2, line-strong are aliases of the new ones); IBM Plex Sans for all text and IBM Plex Mono
(`.num`, tabular) for figures, Bricolage removed; a 12/13/14/15/18/22/28 type scale (`text-xs/meta/sm/base/lg/xl/2xl`, nothing else);
radius 10px inputs and buttons, 14px cards (`panel`, Card), chips round. The extension (0.7.0) uses the same teal and Plex.
Building blocks (`src/components/ui`): Button primary/secondary/ghost/danger (default/outline/destructive alias them), 40px / 32px
(`sm`), `loading` = spinner + "…"; `PageHeader` (crumbs, title = the menu label, one subtitle line, `info` InfoTip, the primary
action); `InfoTip`; `DataTable` (TanStack v9 sorting + pagination, 50 a page, phone cards); `EmptyState` (`States.tsx`);
`StatusChip`/`Verdict` (`verdictTone()` maps every verdict word to good/warn/bad/neutral, with an icon); `Kpi`.
Sidebar (`AppShell.tsx`, `src/lib/workspaces.ts`, `NavItem.more`): one grouped, labelled sidebar (the workspace switcher and
Alt+Shift+W are gone): Home → Today; each workspace's main pages, then "More" (closed by default, remembered per workspace in
localStorage, opened while you're on one of its pages); Settings and Help pinned at the bottom; every item its own lucide icon
(`NAV_ICON`, "?" only for Help); active = primary-soft + primary-ink; open proposals as a badge; collapses to a 64px icon rail
with tooltips; a drawer on phones. Not in the menu because they aren't pages: Supplier Scout (the extension's Alibaba panel)
and the Listing writer (a section of each candidate). Top bar: the page title, one status chip ("All systems OK" or "n issues")
with a popover of Database, SP-API, Keepa tokens, Ads API (information only until it's approved) and the last nightly cron
(`/api/shell`, which also carries the sidebar counts), the cart, Help and a light/dark button. The breadcrumb sits above each
page's title.
⌘K / Ctrl+K command palette (`CommandPalette.tsx`, cmdk via `ui/command.tsx`; "Search or jump to…" at the top of the sidebar):
every page (More included), quick actions (Check an ASIN → `/check?asins=`, Import ads bulk file, New candidate →
`/pl/candidates?new=1`, New run → Upload; an ASIN typed opens its product), and products (ASIN, EAN, title), candidates and
suppliers from `/api/search` (debounced, 8 each). It replaces the top bar's product search box.
Proof pages (everything above applied): Today (Home, titled as its menu item; Kpi tiles, two a row on phones; New run in the
header), Ads → Proposals (one DataTable instead of a table per product and rule, confidence as StatusChip, Approve/Skip/Snooze
per row, Export bulk sheet as the header's primary action with a loading state), Private label → Candidates (a DataTable of
candidates with Verdict chips, score, stage, landed · multiple and Keepa age, Show parked; the chosen candidate below; New
candidate in the header) and Settings (a vertical tab list on desktop, a dropdown on phones, `?tab=` kept in the address, a new
Appearance tab with System / Light / Dark, every section's explanation in an InfoTip via `SectionTitle`; IP-risk removal now
confirms). Every other page keeps its old layout inside the new shell until phase 3. Checked: at 390px no page (all 57 views) is wider than
the screen (Bulk exports' snapshots table was the last; it scrolls in its card now). After-screenshots go to
`docs/ui-audit/after/` (gitignored, local only).
Phase 3a, merge overlapping pages, done (19–20 Oct 2026; one commit per merge, UI only: no table, data or bulk-export change). The sidebar went from 36 items to 27. Old addresses answer with a permanent (308) redirect
to the new page and tab, keeping their query string: `src/lib/moved.ts` (`MOVED`, `movedTo()`), applied first thing in
`src/proxy.ts`; tabs are links (`?tab=`, `useTab()` in `src/lib/ui/useTab.ts`).

| Old | New |
|---|---|
| `/upload` | `/new-run?tab=upload` |
| `/check` | `/new-run?tab=check` (`?asins=` prefills) |
| `/qogita` | `/new-run?tab=qogita` |
| `/hunt` | `/new-run?tab=hunt` |
| `/sellers/scan` | `/new-run?tab=seller` (`?seller=` prefills) |
| `/favourites` | `/shortlist?tab=products` |
| `/watchlist` | `/shortlist?tab=watching` |
| `/pl/niche-hunt` | `/pl/niches?tab=find` (`/private-label?tab=hunt` gets there via it) |
| `/ads/imports` | `/ads/dashboard?tab=imports` (`?import=1` opens the Import sheet) |
| `/settings?tab=ads` | `/ads/rules?tab=settings` |
| `/ads/proposals/exports` | `/ads/proposals?tab=exports` |
| `/ads/keywords` | `/ads/search-terms?tab=keywords` (`?asin=` kept) |
| `/ads/ngrams` | `/ads/search-terms?tab=ngrams` |
| `/tracker` | `/stock/purchases` (`?new=stock&item=…` kept) |
| `/stock/orders` | `/stock/purchases` |
| `/pl/quotes` | `/pl/suppliers?tab=quotes` (`/pl/suppliers?candidate=…` filters the Suppliers tab) |

New run (`src/app/new-run`, the sources in `src/components/newrun/`) is one page with a tab per source; Runs has a New run
button; ⌘K's Check an ASIN opens its tab prefilled.
Shortlist (`src/app/shortlist`, `src/components/shortlist/`): Favourites and Watchlist were the same records (the `favourites` table; the old `watchlist` table is unused), so one page with two tabs of tools: Products (latest result, re-screen, export) and Watching (condition, weekly re-check, alerts). The alert email links to the Watching tab.
Niches (`src/app/pl/niches`; My niches is `src/components/pl/MyNiches.tsx`, Find niches the unchanged `NicheHunt`): tabs My niches (Opportunity Explorer) and Find niches (Niche Hunt).
Ads Dashboard: **Import** in the header opens the import in a sheet (`ImportFlow` in `src/components/ads/ImportFlow.tsx`: the old Imports page's reading and `/api/ads/import` calls, unchanged), and an Imports history tab (`ImportsHistory`, undo confirms).
Ads → Rules has tabs Rules (`src/components/ads/RulesTab.tsx`) and Ad settings (`src/components/ads/AdSettingsTab.tsx`, the old Settings → Ads, unchanged); Settings has no Ads tab, only a link there; "Settings → Ads" in copy now reads "Ads → Rules → Ad settings".
Proposals has tabs To review and Exports (`src/components/ads/ExportsTab.tsx`: batches and snapshots on DataTable, so phone rows are cards; a batch's change list opens in a dialog). Exporting switches to Exports. The bulk sheet itself (`/api/ads/proposals/export`, `/api/ads/exports/…`) is untouched.
Ads → Search terms (`src/app/ads/search-terms`): tabs Keywords (the keyword bank), N-grams (`NgramsTab`, now paginated) and All search terms (`SearchTermsTable`: the Dashboard's per-product term table, which the Dashboard now links to); one `?asin=` picker at the top for every tab.
Stock → Purchases (`src/app/stock/purchases`, the old Tracker page): Tracker and Stock → Orders read the same `purchases` records, so a true merge, shown once (no Type column needed); order number, tracking and expected date sit on each row, Received fills a Stock bucket. The Wholesale group no longer has Tracker.
Private label → Suppliers & quotes (`src/app/pl/suppliers`): tabs Suppliers and Quotes. The Alibaba supplier table is one component, `AlibabaSupplierTable` (`src/components/pl/AlibabaSupplierTable.tsx`, via `SuppliersPanel`), on the Suppliers tab and in each candidate's Suppliers section; the Quotes tab no longer repeats it (it links to the Suppliers tab filtered to that candidate).
One `FileDrop` (`src/components/ui/file-drop.tsx`: drop or click/Enter to choose; large or compact) behind every drop zone: New run → Upload file, the Ads Import sheet, Stock → Import and Niches' Opportunity Explorer CSV. One `DocumentUploader` (`src/components/documents/Documents.tsx`, the old `Documents`) on Brand and Supplier pages, its Attach files now a FileDrop; the Product page only lists documents (`DocumentLine`), it never had an uploader.
Checked: every old address above answers 308 and lands on its page and tab (query kept; `/private-label?tab=hunt` goes via
`/pl/niche-hunt`, two hops); the extension's links (`/pl/candidates?c=…#suppliers`, `/pl/niches`, `/products/…`, `/runs/…`) are
unchanged pages; at 390px none of the merged pages is wider than the screen. Screenshots: `docs/ui-audit/after/3a/` (gitignored).
Phase 3b, restyle every remaining page, done (20 Oct 2026; look and consistency only: no data, schema, route or bulk-export
change). One verdict vocabulary (display only; stored values, exports and the API keep pass/warn/fail etc.), in
`src/components/ui/status-chip.tsx`, sentence case with an icon: wholesale product decision **Buy / Check / Skip**
(`ProductDecision`; pass/warn/fail and the product page's buy/wait/skip), gate result **Pass / Check / Fail** (`GateResult`;
the results drawer's gates, Private label's gates and checks), candidate decision **Order samples / Check / Drop**
(`CandidateDecision`; Gatekeeper's longer title on hover), stock level **In stock / Low / Out** (`StockLevel`), and
**Not scored**. Help uses the same words. Every page in Wholesale, Private label (not the candidate detail), Ads, Stock,
Settings and Help now has a PageHeader (title = its menu label: Plan, Review, Launch checklist…; one primary action; intros in
InfoTips), DataTable tables (50 a page, 25 on a phone; `paged={false}` where the server pages, e.g. Products and My niches;
`pinEnd` keeps row actions in view on wide tables), quiet row actions, danger deletes that confirm naming the thing, and
EmptyStates. The Ad settings keyword-list placeholders show real line breaks. Heights at 1440 → after (10 longest before):
Brand detail 19,938 → 1,570; Candidates 14,741 → 8,649 (the candidate detail below the list is phase 4); My niches 10,323 →
1,487; Find niches 9,398 → 2,013; Brands 8,244 → 1,063; Settings (Gates) 7,752 → 2,820; Suppliers & quotes 7,213 → 1,151;
Products 3,464 → 1,063; Help article 6,312 and Help 4,038 unchanged (article length). No page is wider than 390px.
Screenshots: `docs/ui-audit/after/3b/` (gitignored).
Phase 4a, Today becomes Next steps, done (20 Oct 2026). The engine: `src/lib/server/nextSteps.ts` (rule-based, no AI;
`buildSteps()` is pure and unit-tested per rule, `gatherFacts()` reads the data, `todaySteps()` ranks by priority then age and drops
what you snoozed or dismissed), served by `GET /api/today`; `POST /api/today/steps` saves Later (24 h) or Done in `today_step_state`
(migration 20261020000100). A dismissed step comes back only when its condition's fingerprint changes. Rules: System first (failed or
missed nightly cron, Keepa under 100 tokens, SP-API unset / failed / no sync for 48 h); Ads (no bulk import since a launch started, or
the last one over 7 days old; open proposals; launch milestones: week-1 review on day 7, bid changes day 14, lower target day 28, steady
day 49, each shown until the next); Stock (open purchases with no supplier price or landed cost; Reorder due or soon); Private label
(each active candidate's next action: the next launch checklist step, order samples on a pass, fix or drop on a failed gate, else the
first gate with no answers; Alibaba leads scoring 60+ not messaged; messaged suppliers with no quote after 7 days); Wholesale (applied
brand approvals over 7 days old, the best brand to apply for with a Buy product, one at a time; Shortlist items over a week old).
Today's layout (`src/app/page.tsx`, `src/components/today/`): PageHeader "Today" with the date, New run in the header; numbered step
cards (number, "WORKSPACE · n min", title, why, the button that does it, Show me how, Later, Done with Undo in a toast), the top five
then "Show all (n)"; when nothing's left, "You're all caught up" with the next launch milestone. Under the steps one row of six key
numbers (ad spend over 7 days with ACoS, open proposals, candidates in progress, stock to reorder, Keepa tokens, brands to approve with
a Buy product), each its own icon, wrapping instead of truncating. Open orders missing costs are one step. The old tiles, Recent runs,
Qogita overnight, Favourites and Brands to chase cards are gone (Runs, New run → Qogita, Shortlist and Brands show them). App-wide:
the top bar leaves the page name out when the page has a PageHeader (`usePageHeaderMounted` in `Crumbs.tsx`).
Ask Scout (`src/lib/server/askScout.ts`, tools in `askScoutTools.ts`, UI `src/components/today/AskScout.tsx`, `GET/POST /api/ask`):
questions about your own data, answered by the Listing Writer's client, model and prices (Ads → Rules → Ad settings) with thinking off
(`leanThinking`: `between_tools` on Sonnet 5.5), 1,500 output tokens a request, `tool_choice` auto and at most 5 lookups a question
(then `none`: it must answer), the answer in a fixed JSON format (answer, figures with their page, links, what's missing), links kept
to the app's own pages. One empty answer gets one nudge. Six READ-ONLY tools: find_products, product_metrics (an ASIN's ad figures,
unit economics, Amazon orders by channel between dates), stock (levels, demand, cover, reorder, purchases), candidates (verdict, gates,
launch steps), suppliers (wholesale suppliers, Alibaba leads by status, quotes), proposals. `askScoutTools.test.ts` runs every tool on a
database that records writes (none allowed) and checks the module's source and imports. Each question is one row in the AI call log
(`ads_ai_calls`, feature `ask_scout`, tokens and £ over every round) and one in `ask_scout_history` (the newest 20 kept; migration
20261020000200). Under each answer: tokens in / out, £, lookups, time. On Today it's the right-hand panel at 1280 px and wider; narrower,
the header's Ask Scout button opens it in a sheet; ⌘K "Ask Scout…" from anywhere (a question typed there is asked straight away).
Checked on real data, 20 Oct: three questions at £0.025–£0.033 each. Screenshots: `docs/ui-audit/after/4a/` (gitignored).
Phase 4b, Private label pipeline (20 Oct 2026). **Pipeline board** (`/pl`, Private label's home and first menu item "Pipeline";
`src/components/pl/PipelineBoard.tsx`, `GET /api/pl/pipeline`, `src/lib/server/plPipeline.ts`): columns Research (Gates 0–3) →
Validate (Gates 4–7) → Sourcing (quotes, samples, artwork, PO) → Launch (inbound, listing, first ads) → Live (selling). The column
(`src/lib/pl/pipeline.ts`, pure and tested): where you moved it (`pl_candidates.pipeline_stage`, the one new column, migration
20261020000300, backfilled from the records), else what the records prove (listing live or launched → Live; inspection to ads launched
→ Launch; samples status, a sourcing checklist step, a quote or a messaged supplier → Sourcing), else Gates 0–3 all passing → Validate,
else Research. A launch step, a quote, a lead's status or a status change moves a stored column forwards, never back
(`advanceStage()`). Each card: name, the next action in one line with the real figures, an 8-segment gate bar (passed teal, in progress
amber, not started grey; its aria-label reads every gate), the verdict chip, Open; Live cards link to Ads and Stock for the ASIN.
Products already selling without a candidate (Ads products with no `pl_candidate_id`) show in Live. Drag a card to another column, or
use its Move to… menu (keyboard); moving back asks first; a move keeps the status in line (Sourcing/Launch → samples, Live → launched,
Research/Validate → researching) so Today agrees (`POST /api/pl/candidates/[id]/stage`). Parked and dropped candidates hide behind
"Show parked (n)" and only unpark from the menu. Header: Import niches, New candidate (the dialog is now `NewCandidate.tsx`, shared
with Candidates). Phones: one column a screen, swiped, with a strip of column chips to jump. The Candidates table stays as
"Candidates". `/pl` no longer redirects to Candidates; Private label crumbs point at the board.
**Candidate page** (`/pl/candidates/[id]`, `src/components/pl/candidate/`): the detail below the Candidates list is gone (Candidates is
just the table now: 8,649 → 900 px at 1440); `/pl/candidates?c=<id>` answers 308 with the candidate's page (`movedTo()`; the
extension's `#suppliers` anchor survives the redirect and opens that tab). Header: breadcrumb Candidates / name, chips ("All 8
gates passed" or "Gates n/8", "Next: …", its column on the pipeline), Park (secondary; Unpark when parked) and the one primary
action: a launch step it ticks ("Mark samples received"), else a link to the tab and gate that does it ("Chase 1 supplier" →
Suppliers & quotes); the gate bar under it. Tabs (`?tab=`), each mounted only when open and loading its own data: **Overview**
(Gatekeeper in one line a gate with Pass/Check/Fail, linking to that gate; "The numbers": price, landed per unit, profit after ads,
first order, goods + freight from the chosen quote, break-even ACoS; the next action; then Details: notes, name, niche keyword,
category, status, page-one ASINs, Refresh from Keepa, Delete), **Gates (n/8)** (one gate at a time with a stepper, `?gate=0–7` or
`score` for the scorecard and waivers; every field, check, waiver and compliance rule as before; `useCandidate()` holds the
scoring and autosave the old Workspace had), **Reviews** (Gate 4's review miner, pasted and extension-captured, its boxes capped
in height, and each listing's critical reviews), **Suppliers & quotes** (the shared Alibaba supplier table for this candidate,
then its quotes), **Listing** (the Listing Writer, unchanged), **Launch**. `GET /api/pl/candidates/[id]` now also returns the
settings, rate card and ads CPC. Every link to a candidate (Today's steps, ⌘K, Ask Scout, Niches, the supplier table, the Ads
dashboard) goes to the page and, from Today, the right tab and gate. Heights at 1440 for Lens cleaning wipes: Overview 1,758,
Gates 1,226–1,446, Reviews 2,487, Suppliers & quotes 1,379, Listing 2,766 (the Listing Writer's own length), Launch 1,470.
**One launch flow**: the candidate's Launch tab is four steps (`?step=`): Checklist (the old launch checklist, listing ASIN and
budget against Gate 7) → Inbound / stock check (`GET /api/pl/candidates/[id]/stock`: the listing ASIN's stock item per bucket, cover,
its purchases and units inbound, the shipping steps ticked) → Ads launch plan (the Ads launch builder for that candidate, logic
unchanged) → Export bulk file (create and download the sheet). The builder is one component, `src/components/ads/LaunchBuilder.tsx`
(`useLaunchBuilder`, `LaunchForm`, `LaunchPlan`, `LaunchExport`; the same `/api/ads/launch` calls and bulk sheet as before), and
Ads → Launch stays in the Ads menu, rendering it with its product picker. The checklist's "Ads launched" links to step 3. The
Private label menu no longer has Launch checklist: `/pl/launch` redirects to the Launch tab of the candidate most recently worked
on that's launching (samples, launched or a checklist step done), else to the pipeline (today: the pipeline). Help updated
(getting started, Private label, launch checklist, writing the listing). Screenshots: `docs/ui-audit/after/4b/` (gitignored).
Phase 4b done.
Phase 4c, one results table for wholesale products (20 Oct 2026; UI only: no schema, scoring, export or stored-value change).
**ResultsTable** (`src/components/results/ResultsTable.tsx`, TanStack Table + Virtual, DataTable's header look): one default set of
columns on every page (Product = image, title, ASIN, EAN, supplier; Verdict Buy / Check / Skip / Not scored / Error with Dormant,
Waived and Cost overridden under it; Buy price; Sell price; Profit; ROI; Sales / mo; BSR; Offers; Gated Open / Approval / Blocked)
and the rest in a column picker (show, hide, reorder, density, reset; saved per page in `ws.results.columns.<page>`; the pure logic in
`tablePrefs.ts`, tested). Figures mono and right-aligned; sticky header, checkbox and product column; a pinned "⋯" row menu (Add to /
Remove from Shortlist, Re-screen, Product page, Open on Amazon, Copy ASIN); a row click opens the page's drawer (the inline chevron
details are gone). Paging: `virtual` (a run, scrolled in its card), `client` (50 a page) or `server`; on a phone (<640px) every row is
a card (image, title, verdict, profit, ROI, sales / mo, ⋯, Details) 10 a page (phase 5). The VAT basis of the profit figures is one tag above
the table. **ResultsFilterBar** (`src/components/results/ResultsFilterBar.tsx`): search (ASIN, EAN, title, brand), verdict chips Buy /
Check / Skip / Not scored (multi), Profit ≥, ROI ≥, Sales/mo ≥, BSR ≤, Gated any/yes/no, supplier, and More filters (Error, Dormant,
bands, On Shortlist, Waived, Amazon on listing, approval, failed gate, brand, every range's min and max, saved filter sets). The
filters live in the address (`filtersFromQuery` / `filtersToQuery` in `src/lib/filters.ts`, tested; `?verdict=buy,check&profit=3
&bsr=..50000&gated=no`; old `?verdict=pass` still reads), via `useUrlFilters()`. `useResultActions()` holds the star, note, watch,
waiver and cost-override calls the pages share. The bulk bar says Add to Shortlist / Remove from Shortlist / Export selected (xlsx).
Run detail (`src/app/runs/[id]/page.tsx`) is on it: virtual scrolling over every row, EAN groups with their other ASINs, the filters
in the address instead of remembered per run in the browser, the drawer, the full bulk bar (waive, cost, re-screen, export, remove).
Shortlist → Products (`src/components/shortlist/FavouritesTab.tsx`) is on it: 50 a page, its filters in the address beside
`?tab=products`, Remove from Shortlist in the row menu and bulk bar. The old results table and `FilterBar` are gone.
Brand detail (`src/app/brands/[key]/page.tsx`) is on it: `GET /api/brands/[key]` also returns each product's latest result (the
run's row shape); the verdict is the brand map's (default profile; Not scored when never priced); the best offer per EAN and the
latest run sit under the title; Re-screen goes through the new `POST /api/results/rescreen` (`runFromResults()`: results from any
runs as one new run, each on its own offer, default profile). Today's "Apply to sell" step opens the brand at `?verdict=buy,check`.
Products (`src/app/products/page.tsx`) is on it, still paged by the server (`listProducts()` in `src/lib/server/productPage.ts`): 50
a page, 10 on a phone (`?size=`), `?page=` in the address; it returns each product's latest result for the table and drawer. Search,
the plain verdicts (the brand map's priced verdict), brand and supplier (any supplier carrying it) go to the query; the other filters
(profit, ROI, sales, BSR, gated…) are answered by the `product_list` view (phase 5, below). Bought is the page's own toggle. Row and bulk actions: Add to
Shortlist, Re-screen (via `/api/results/rescreen`), Export selected (xlsx, the run export's format), the selection kept across
pages. ⌘K has "Buy products" (`/products?verdict=buy`).
The small comparison tables have the DataTable look: `DataTable dense` (tighter cells, a table at every width that scrolls sideways
instead of becoming cards, no pager or height limit) for the drawer's and product page's Fees by source and Qogita offers (sortable,
cheapest first; the sort is no longer remembered), a purchase's predicted vs actual and Stock → Purchases' accuracy table.
Heights at 1440 / 390, before → after: Run detail 1,296 → 1,296 / 1,464 → 3,383 (on a phone the rows are 20 cards a page instead of
a table scrolled in its own box); Shortlist → Products 1,004 → 1,009 / 1,028 → 1,196; Brand detail (Beter, 90 products) 1,570 → 1,838
/ 6,172 → 4,463 (no longer 1px wider than the screen); Products 1,063 → 1,271 / 9,464 → 2,718. Screenshots: `docs/ui-audit/after/4c/`
(gitignored).
Phase 4c done.
Phase 5, polish (20 Oct 2026). **Products' filters fast**: `product_filter_facts` (migration 20261020000400) keeps what the
results filters read of each product's latest result (the same `toFilterRow()`, `src/lib/server/productFacts.ts`), indexed on
profit, ROI, sales, BSR and approval; the `product_list` view joins it to the brand map, one row per ASIN (newest), with
`facts_fresh` false when the result's `updated_at` has moved on. Products refreshes stale facts first (normally none; the brand
map's refresh also refreshes them when it finishes), narrows in the database, then `matches()` decides as on a run's table.
A combined filter (profit, ROI, sales, BSR, not gated) went from ~4.1 s to ~0.3 s.
**Runs remember their filters again**: `useUrlFilters({ remember })` saves a run's last filters (`ws.filters.run.<id>`, the old key) and puts them back when the run opens with none in the address; filters in the address win, Clear all forgets them.
**Brand detail's drawer** pushes the page aside on wide screens (`xl:mr-[27rem]`, as on Run detail and Products) instead of covering the table's right edge.
**Results on a phone: 10 cards a page** (was 20; Run detail, Brand detail, Shortlist, and Products' server pages, `?size=10`), the pager under them worded Previous / Next (44px) with a page picker ("Page [n] of N"), and a new page scrolls back to its first card.
**Extension 0.8.0**: the product panel and search results show the app's words, colours and icons (Buy / Check / Skip / Not scored as round chips; the panel lists each gate as Pass / Check / Fail), and candidate links open `/pl/candidates/<id>` (Suppliers & quotes, Reviews or Gate 3 tab) instead of the old `?c=` redirect.

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

**Business (Settings → Business).** `business_settings`: Launch capital (`launchCapital`, £1,000
default; moved from Private label's `budget` setting by migration 20261017000100) for Gate 7, scorecard
line 9 and the launch budget bar, overridden per candidate by Gate 7's "Capital for this launch (£)"
field (`capital`, `capitalFor()`; the check's label shows the figure and its source). Copy follows the
effective capital too (`gateBlurb()` fills Gate 1's "{capital}", `capitalText()`; the Candidates intro
uses the business figure). Gate 1's review depth (fill.ts reviewsBand) reads the newest third of page one by first_seen
(at least 3 listings; all listings, said in the caption, when > ⅓ lack first_seen), Gatekeeper's bands
and 150/month qualifier unchanged; the caption shows both reads; the check, dropdown labels and
scorecard line 1 say "newest third". A Keepa-filled band saved under the old read is refilled
from the stored ASINs when the candidate is opened (candidateDetail; never over a manual value), so
the candidate list shows the old band for a candidate until it's opened or Keepa-refreshed. The structural "Drop it" verdict names only the structural lines
scoring ≤ 1. Proposals in comments, not applied: max first order from capital × 0.6 ÷ landed (supplierScore.ts maxMoqOf), RFQ tiers from it (quotes.ts). VAT registered (default yes) and rate (20%),
written into every screening profile's fees and applied by loadProfile, and to Private label's
settings (Gate 6: revenue ÷ 1.2, fees ex-VAT with DSF, margins on revenue, VAT payable as info; a
quote's landed cost excludes the reclaimed import VAT). `profitOnVatBasis` is the rule; results store
their basis, input VAT and VAT payable in `fees`; profit, ROI and margin carry a VAT reg. / Non-VAT tag
(results table, breakdown, product page, plan, Tracker, Gate 6). Recalculate all re-screens every
finished run from stored data and lists the 20 biggest profit changes (`recalc_jobs`). The plan and
the Qogita cart show the VAT paid at checkout and the cash needed. Price basis for profit (business setting, mirrored into every profile's scoringPrice): current
Buy Box, 90-day median (new `medianBuyBox90d`, backfilled from stored Buy Box series), 12-month
median, or Conservative (lower of current and 90-day median, the default); no current Buy Box falls
back to the 90-day median. Each result stores `fees.priceBasis` and `fees.at` (profit at the current
Buy Box and at the 90-day median), shown side by side with "Gates use" on the card, the product page
and the extension; the price-regime gate tags a Price spike over 15% above the 90-day median
and no longer re-prices. Screenings on another price or VAT basis show a Stale banner with Re-check
(stored-only re-screen of those results). Qogita: the region (UK/EU) is a
business setting; suppliers "Qogita UK" (GBP, ex-VAT, shipping included) and "Qogita EU" (EUR, ECB
rate; the old "Qogita"), chosen by the prices' currency with a mismatch warning; a UK pull or file
archives the EU offers for its products (`offers.archived_at`, left out of plans and picks) and adds
offer count, pre-order and delivery weeks; the upload page reads Qogita's catalogue export
(`catalogFile.ts`: header row found, GTINs as text, HYPERLINK URLs, price per item with Unit as the
case size).

**Private label: launch your own product.** Candidates are scored through Gatekeeper's eight gates,
a 10-line scorecard and a verdict, with Keepa filling Gates 0–2, Opportunity Explorer captures
(via the extension) filling Gates 3 and 5, the fee engine Gate 6, ads-per-unit derived from the
Ads CPC, and waivers per check or gate. Demand (scorecard line 2 and Gate 2's demand check) is judged
on Amazon's bought-in-past-month when the reference shows it, rank drops otherwise; Gate 2's reference
is picked in a dropdown (default: the longest Keepa history, `reference_pinned` once you pick; a switch
re-runs Gate 2 only, reusing a 7-day Buy Box snapshot) with listing age and a 12-month rank sparkline
from stored series; Gate 0 has a target price band (default £18–35) that its sell-price check and Gate
1's price spread read; Gate 1 lists every page-one ASIN (brand, reviews, rating, bought, price, first
seen) with the two youngest and two least-reviewed marked; each has autosaved notes at the top and can be parked
(shelved with a reason, in a collapsed Parked section; unpark restores its status). Niche Hunt finds niches that already pass Gates 0–1: Direct
mode (one filtered Product Finder query per category, then detail grouped by leaf, an incumbent
check per niche with 3+ qualifying, off-niche incumbents by Keepa category) and Leaf mode (size
each leaf, then detail), with a hard token cap (estimate + 10%). Niche Import (Private label → Niches) reads Opportunity Explorer category
downloads (CSV: header found by "Customer Need", fuzzy column matching, apostrophe negatives,
duplicate niches merged as aliases), scores every niche 0–100 without Keepa (demand, growth, price,
fragmentation, units a product) with flags (spike, fading, low price, high returns, electrical,
regulated, big brand: an editable list in Settings → Private label, heavy/bulky, low units),
shortlists, runs a one-at-a-time Keepa incumbent check on a niche's search terms (up to ~83 tokens: one
Product Finder page a distinct term, up to 3, a term containing another skipped, restricted to the
niche's categories' Keepa roots, merged in turn to 25 detailed; only titles with any of the terms
as a phrase, else all its words within a 4-word window in any order (the matched term shown, phrase
preferred; a window match doesn't count with mat/cover/liner/replacement/holder/"stand only" or in
Feeding Mats), with the niche's Opportunity Explorer
capture's #1–#3 clicked ASINs per search term (deduped, up to 30) detailed first and counted on-niche
("POE top clicked"), not marked Not on-niche by hand (kept on the niche for reruns; the shape recomputed
from stored snapshots, no tokens), none of the off-niche words (editable in Settings → Private label,
`src/lib/pl/offNiche.ts`; cat/dog/toy/game allowed for pet niches, kids/children for Baby Products and Toys & Games, baby for Baby Products,
toy/game for Toys & Games; a term's own words and plurals never exclude) not an accessory for any of the terms ("for", "fits", "compatible with" just before one) and, for a bag/box niche, not in Keepa's Locking Carabiners or Bait Storage and without "dry" in the title count; the 10 best
sellers among them by monthly sold, else sales rank, decide open/contested/dominated; under 5 found
in the category, the same search runs on all of Amazon ("found outside <category>", +11 tokens a
term) and the on-niche products' Keepa categories show as chips; Rerun reuses
the finder list and 7-day snapshots, often 0 tokens) and creates candidates (seeded with the check's
on-niche top 10 as page-one ASINs, the best-converting captured term else the first as niche
keyword, and the average price as sell price); re-importing a category keeps status, notes and
shape. The category is picked from Opportunity Explorer's 25 top-level UK categories (or Other…),
each mapped to the rate card category candidates use for fees. Home has a Niches tile. The Niches table is filtered, flag-hidden,
sorted and paged in SQL (100 a page, 50–500, "showing X–Y of N"), with the summary strip counted
over every niche in scope. A niche sent from Opportunity Explorer (the extension's capture, linked by title = customer need or
alias, latest wins, relinked on every import, merge and re-read; the picker's "Niche only" links it
without any candidate) gets a sortable best search-term
conversion column and a BUYING (a term ≥ 4%) / BROWSE-ONLY (none ≥ 2.5%) chip, plus a reads-only
line under its score; candidates get Gate 3's "best search-term conversion" field and an unscored
eleventh scorecard line (outside the /30 and the verdict). A niche in several categories' downloads (identical search terms and search volume) is
one row with every category (`categories`, shown as chips), its status, notes, shape and ledgers merged,
on every import; the existing data was merged (233 niches across categories, 242 rows folded in). Quotes turns supplier quotes into
a landed cost per unit and total cash (FX, freight, duty, import VAT, inspection), writes it into
Gates 0 and 7, chooses a supplier and generates the RFQ. Supplier Scout (Private label → Suppliers, and a Suppliers section on each candidate): the extension
(0.5.0, `alibaba-parse.js`, selectors in one config, tested on a saved 60-card page) sends an alibaba.com
results page's listings, per click, to a candidate's `pl_supplier_leads` (one per listing URL; a
re-capture updates price/MOQ/sold and keeps status and notes); each is scored 0–100 by
`supplierScore.ts` (price per our unit vs Gate 6's target ex-works, default landed ÷ 1.4, 35; MOQ vs
max, default 1,000, 20; trust 25; relevance 20) with flags (not a factory, unit unclear, MOQ too high,
off product hidden by default, high price) and rescored when the targets change; Copy RFQ fills an
editable template (Settings → Private label, `pl_text_settings`); Add quote starts a prefilled quote;
Home counts the ones to contact. Gate 4's review miner takes pasted 1–3★ reviews per page-one ASIN, a box for every ASIN on the candidate (no cap; reviews for an ASIN not on it are kept: removed from candidate, add it / keep separate) (`pl_review_dumps`), or the extension's
capture from amazon.co.uk review pages (0.4.0: stars, date, title, body, variant, helpful votes over the
pages you click through, sent per click to the candidate with that ASIN, merged by review id, a hand
paste kept until you choose; rendered 1–3★ in Amazon's layout), splits
them, counts complaint phrases locally (stop words, bigrams/trigrams, an editable synonym list; plurals
folded for counting only by `singular()`, each theme shown in its commonest wording, e.g. "clean glasses",
marked under its folded `key`) into a
sortable Themes table, and the theme you pick fills the gate's share and a draft six words; an
optional Claude summary runs only on a click. The Listing Writer (a Listing section on each candidate,
`pl_listing_drafts`, `src/lib/pl/listing.ts`, `src/lib/server/plListing.ts`) writes the title, five
bullets, description, backend terms and a differentiation angle with Claude, only on a click (feature
`pl_listing` in `ads_ai_calls`, cached by input hash), from Gate 4's themes, pick and summary, the
attached POE capture's search terms and the linked Ads product's keyword bank, in an editable brand
voice, and the Listing section's facts (`pl_candidates.listing_brand/_specs/_suitable/_not_for/_avoid`;
brand required; key specs start from the spec field). Competitor brands = the Settings list plus the
page-one ASINs' brands. First-draft rules (`src/lib/pl/listingRules.ts`) are in the prompt and
enforced after the call (brand-first Title Case title cut at a word, promo words out, CAPITALISED
bullet headers, backend terms cleaned of title words/plurals, filler, health/body and not-for words,
claims to avoid, then filled to 200–249 bytes from search terms, bank and uses); the Checks list holds
it to every rule (title within its limit with brand, top term, pack size, Individually Wrapped and top three
uses, first 80 characters, bullets 150–250 answering Gate 4's pick and every real complaint ≥ 4%,
specs and suitable/not-for bullets, three-paragraph description with every spec, backend bytes and
words, claims), and anything failing gets ONE repair call (subject `<id>:repair`, logged and cached
like the first) before the version is saved ("generated + repaired"). No-repetition and spec-strength checks: each key spec in at most 2 bullets, bullet 4 only the specs no
other bullet states, bullet jobs (1 pick, 2 result, 3 size/feel, 4 new specs, 5 suitable/not for), no
3-word phrase in two bullets, no repeated title word but the product noun (a repeated one-word use is
swapped in code for the top search-term synonym, e.g. Glasses → Spectacles), every number/timing from
Key specs or Pack size, backend words linked to the inputs (dropped in code when not; PRODUCT_FORMS
adds other names for the product noun). Performance claims hedged unless Key specs
state them (absolute_claims: streak-free, without leaving streaks, never, always, guaranteed, 100%,
every time); a title word may repeat inside one of the top 3 search phrases (phraseAllowance, one
word between allowed); words inside the pack size phrase ("200 Wipes") or an exact top-3 search phrase
("Lens Wipes for Glasses") don't count toward the repeat limit at all (exemptPositions, first mention
of each); title length is a soft check (`soft: true`, amber warning below 100 characters, no hard
minimum; over the limit stays hard), and only hard failures go to the repair call; backend top-up in code under 200 bytes (search/bank/use words by volume, then
plural/singular variants of nouns, then PRODUCT_FORMS), repair only if still short; each run's calls,
tokens, £, repair reasons and top-up are saved in the version (inputs.run) and shown under Regenerate
all (listingView.lastRun). The old "N of 5 bullets answer a theme" editor note is gone (Checks owns
it). "Needs proof" highlights
performance promises without blocking, once, under its own field. Checked live in the browser: title limit (default 200, per candidate), lead term, ALL CAPS,
promo words, capitalised bullet openers, three bullets on complaint themes, backend ≤ 249 bytes
(cleaned of title words, brands from Settings → Private label, ASINs), compliance claims with
rewrites, and a sortable keyword-coverage table weighted by volume. Per-field Regenerate, Copy all,
a Seller Central flat-file row, and every generation/edit/restore kept as a version. Launch is a 13-step checklist (samples to
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
approved export as a bulk sheet in Amazon's own column order, as batches that can be reverted
(or discarded when never uploaded: proposals reopen, a launch's plan and phase go back), with snapshots to restore. Also: n-grams, the launcher (Auto/Broad/Exact/PT Create sheet and a
60-day plan), extension rank checks. Phase 5: bids use a smoothed conversion ((orders + k × product's) ÷ (clicks
+ k), k = 20 in Settings → Ads), shown raw and smoothed in every reason (Bid down, Bid up's ceiling,
Harvest's cap, the launcher's starting bid: the higher of that and the account CPC × 0.8, both shown); each rule has its own lookback window (7/14/30/60 days);
whitelist and blacklist (account and per product: never negatived/paused; negative phrases in new
campaigns and proposed for broad/auto ones); TACoS mode per product (target TACoS → the ACoS it
allows, Ranked −25%, organic share on the tile, a switch suggestion); listing health (ad CTR/CVR vs
the niche; holds Bid up back when poor); the keyword bank (Ads → Keywords and per product: POE,
harvested, n-gram winners, rank-tracked and manual terms; Add as exact / negative queue approved
proposals; feeds the launcher's head terms). Help's first Ads article is "Ads: the playbook" (set up → launch → weekly
loop → 60-day arc → monthly → troubleshooting → the API), linked from the dashboard's empty state
and Home's Ads row. The AI research layer (Claude, on your click only): Explain this product (a cited
narrative per product), Recommend targets (launch and steady ACoS, Apply writes them) and the
monthly review on Ads → Review (per product, account-wide, did applied batches work, three ranked
recommendations mapped to rules; optional schedule on the 1st, off by default). Every call is
logged in `ads_ai_calls` with tokens and £ cost; answers are cached per data hash.
The product picker on Dashboard, Proposals, Keywords, N-grams and Launch reads `?asin=` (the URL is the
source of truth; picking rewrites it; `useAdsProduct` in `src/components/ads/ProductPicker.tsx`); an `?asin=`
with no ads data is listed as "no ads data yet" rather than the picker showing another product. Keywords
lists launch-only products too (19 Oct 2026: `?asin=B0HM8FBX3T` showed B0H9ZKYYHZ in the picker).

**Stock: track what you hold.** Your own items (stock_items) in three buckets: self-ship and TikTok
FBT are ledgers of movements (received, sale, return, adjustment, transfer); Amazon FBA is SP-API's
fulfillable count and Amazon sales come from the orders sync, never typed. Pages: Levels (items ×
buckets, value at cost, days of cover, status, an item drawer with actions), Movements (filters,
CSV export), Sales (non-Amazon channels, stock-checked, cost snapshot at sale), Orders (every purchase of a stock item: Receive, Edit, Delete),
Reorder ((lead time
+ buffer) × daily demand, 30 days' quantity, Create purchase → the order form), Import (StockPilot's raw
table export or an items CSV, previewed, idempotent). Every purchase links to a stock item: a product-page purchase
finds or makes the item by ASIN from the catalogue (title, image, brand, package data, supplier),
so Tracker, product page and Stock show one record with one Edit (the receipt follows once
received); images come from the catalogue/Ads/SP-API free, Keepa (1 token) last. Record a new order (Levels, and the Tracker): item and
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
| **Amazon Ads API** | **Pending approval.** LWA client credentials are in the env (`ADS_LWA_CLIENT_ID`, `ADS_LWA_CLIENT_SECRET`); no connector yet (backlog). Until then: bulk export in, bulk sheet out. When the connector is built its LWA return URL is `https://ws.dgr8cali.co.uk/api/ads/oauth/callback`, with allowed origin `https://ws.dgr8cali.co.uk` (register both on the LWA security profile). |
| **Anthropic API** | Live (`@anthropic-ai/sdk`): Ads Explain, Recommend targets and the monthly review, Private label's review summary and Listing Writer, only on a click or the monthly schedule (off by default). Model and prices in Settings → Ads (Sonnet 5.5 default); cost per call logged in `ads_ai_calls`. Claude 5-family models think by default, hidden but billed as output (`ads_ai_calls.thinking_tokens` logs it): the Listing Writer's calls are `lean` (Sonnet 5.5 `thinking: between_tools`; Sonnet 5, Haiku 5.5, Opus 5 `disabled`; Opus 5.5, Fable, Mythos effort `low`), and their answer format caps every field (title 200, bullet 250, description 1,000, differentiation 400 characters, backend a list of ≤ 40 single words joined and trimmed to 249 bytes in code; the caps go in the descriptions, since structured outputs can't enforce lengths, and normaliseDraft enforces them). An answer cut off at max_tokens is retried once at double the limit (cap 16,000), both attempts logged; still cut off, it says "The answer was cut off (too long)" and nothing is cached. Limits: listing 8,000 (repair and per-field 4,000), Explain and Recommend targets 6,000, monthly review 8,000, Gate 4 summary 4,000; the AI routes allow 300 s. |
| **Supabase** | Self-hosted on the server (https://db.dgr8cali.co.uk; nightly dumps to `~/backups`, 14 days). Postgres with RLS on every table; pg_cron + pg_net run the watchdog (restarts stalled runs and hunts). The old Supabase Cloud project is kept untouched as a rollback. |
| **Netcup server** | Hosting (Docker; `make deploy`, `make migrate`, `make logs`). Crons in its crontab: Qogita nightly 03:00, Watchlist Sunday 06:00, Ads review 1st of the month 06:00 (does nothing unless turned on), secret from `~/wholesale-scout/.cron.env`, output in `cron.log`. Env vars in `~/wholesale-scout/.env`. |
| **Vercel** | Retired 17 Oct 2026. `wholesale-scout.vercel.app` only redirects (308, every path) to the server; no crons. |
| **Qogita** | Live: nightly catalogue and offer pull. |
| **Resend** | Watchlist alert emails, sent only when `RESEND_API_KEY` and `ALERT_EMAIL_TO` are set (not set locally, nor on the server yet). |

## Backlog (priority order)

1. **Ads: Phase 3, the Ads API connector**, once approved: pull reports and entities, apply approved proposals (rules in Auto mode), hourly data for budget timing, impression share, keyword-level days.
2. **Ads: keyword and competitor research** (the old Phase 4 idea: feeding the rules and the launcher; the AI layer now covers narrative, targets and the monthly review).
3. **Stock: TikTok/eBay sales recording in use** (record real sales so demand, cover and reorder points mean something; a faster entry path or imports from TikTok Shop/eBay order exports).
4. **General: move pg_net out of the public schema** (Supabase advisor: extension in public).
5. **General: Resend email alerts** configured on the server (`RESEND_API_KEY`, `ALERT_EMAIL_TO` aren't set there yet) and extended beyond the Watchlist (stock low/out, reorder due, stock guard, hunt finished).
6. **General: data backup workflow** (only the schema is backed up today, to `supabase/schema.sql`; data relies on Supabase's own backups).

## Known rough edges

- Next steps: "Add costs" opens Stock → Purchases, not the purchase itself (the page has no per-purchase link yet). Keepa's low-token step
  comes back each day it's still low (its condition has no change to wait for). Ad spend in the key numbers reads daily campaign
  rows only; with range reports alone it shows the date the data stops.
- Ask Scout's £ uses the AI price table's Sonnet 5.5 row ($3 / $15 per million tokens); Anthropic now lists Sonnet 5.5 at $2 / $10, so the
  costs shown are 1.5 times the real cost until the prices in Ads → Rules → Ad settings are updated. A lead's "contacted" status is the only
  sign of no reply: the app doesn't read messages.

- **Extension 0.5.6** fixes what it could put in chrome://extensions → Errors (an uncaught "Amazon took over 30 s to load" when a rank-check tab was closed, uncaught background errors, unchecked `lastError` in the popup, the reviews parser's warning on product pages, whose new `reviewTitle`/`reviewText` markup it couldn't read). Checked in a scratch Chromium with the shipped and fixed copies; old entries stay listed until **Clear all**.
- **Ads bulk sheets: the first launch upload accepted after two fixes**: the first real upload attempt (the B0HM8FBX3T launch sheet, 18 Oct 2026) was rejected as a whole because the file carried the export's "Sheet3" version sheet ("the first three column headers must be Product, Entity then Operation"); the other 50 rows were only "not processed" because of it. The second attempt was rejected for "campaign name has invalid characters": the names used an en dash ("B0HM8FBX3T Auto – 2026-10-19"), and the bidding strategy was the export's "Dynamic bids – down only". Both were fixed the same day: every upload (launch and proposals) is the "Sponsored Products Campaigns" sheet alone; launch names use a plain hyphen; strategies are written as the upload takes them ("Dynamic bids - down only", mapped from the export's en-dash spelling) and placements in the upload's casing ("Placement Top"); and a guard refuses to write a batch with any non-ASCII character in a name, temporary ID or fixed-value column (keyword text is exempt). Tests check each workbook's sheets, their first three headers, and the guard. **Accepted**: a copy of batch "2026-10-18 #1" with exactly those fixes, applied by hand, was uploaded on 18 Oct 2026 at 01:58: Success, 50/50 rows processed, 0 errors. The batch is marked uploaded. Its campaigns are B0HM8FBX3T Auto - 2026-10-19 (A00416231CTWH2NB1JO6R), Broad - 2026-10-19 (A004190334LW4B2GMPN3J) and Exact - 2026-10-19 (A00417791L0MY51SPNGKF); its launch batch and plan carry the same hyphenated names, so the next bulk export's import matches them. Confirmed accepted by Amazon: "Placement Top" and "Dynamic bids - down only". Not yet through an upload: "Placement Rest Of Search", "Product Page" and "Amazon Business" (Amazon's documented casing), "Dynamic bids - up and down", and Update rows (a proposals batch). Amazon's error report is kept in `docs/samples/ads/bulk-error-report.xlsx` (format in the `.md` beside it). Batch "2026-10-02 #1" (7 proposals) waits to be uploaded or discarded.
- **Daily Ads reports** are parsed against a sample in Amazon's format: the first real daily Campaign/Placement export confirms the column names.
- **Bid up, Budget, Revive** need the daily Campaign report imported; impression share, hourly budget timing and keyword-level days need the Ads API.
- **Keepa's salesRankDrops** undercounts fast sellers: Niche Hunt's direct mode filters on monthlySold instead, and the Niches incumbent check costs up to about 83 tokens a niche (a finder page per distinct search term, and the finder returns ASINs only, so 25 are detailed to read titles and sales).
- **Off-niche incumbents** use Keepa's category; a few borderline products (filed elsewhere but near the niche) are excluded.
- **Products** loads 50 a page from the server: a column sort orders only the loaded page.
- **Gate 7's stock line** from a quote is units × the rounded landed cost per unit (pennies off the quote's total).
- **Stock** demand for the pill box is thin: no Amazon orders after 13 Sept in the sync, 0 FBA units, and no TikTok/eBay sales recorded yet.
- **The StockPilot app** still runs against its own Supabase project; a Dyad chat log on disk (`~/dyad-apps/StockPilot/.dyad/chats/44/…`, gitignored) holds its old project's anon key in plain text.
- **AI prices are assumed defaults** ($3/$15 per M tokens for Sonnet 5.5, $1/$5 Haiku 4.5, $5/$25 Opus 5.5, £0.79 per $): check them against Anthropic's pricing and edit in Settings → Ads.
- **The monthly review** needs the daily Campaign report for per-month figures and batch before/after verdicts; with range data only it says so. No batch has been uploaded yet, so no verdict has been tested on real data.
- **The review miner** has no part-of-speech tagger: phrases are content-word pairs and triples after stop words, so a few odd ones ("too easily") show; Ignore hides them. Tested on a fixture of 40 fake reviews; the first real Amazon paste confirms the splitting.
- **Stock audit** records "you" as the actor: the app has one user behind the password gate, so it doesn't tell people apart.
- **Order currency**: the landed cost per unit is kept in £; editing an order's price in another currency or its rate re-works the £ (and its receipt's unit cost).
- **Ordered stock shows as "out" on Levels** until it's received (e.g. the Biotene and Lifeproof items made from their product-page purchases).
- **Rule windows on range data**: search terms and keywords come in import ranges, not days, so a window shorter than an import counts that import in full (the rule says so). Exact windows need imports of about the window's length, or the Ads API.
- **The pill box's keyword bank is thin** (1 harvested term): it has no linked private-label candidate (no Opportunity Explorer terms) and no rank checks yet.
- **Supplier Scout** reads Alibaba's markup as of Oct 2026 (`ALIBABA_SELECTORS` in `extension/alibaba-parse.js`): a markup change shows as unread cards in the panel and the console. Trade Assurance and Verified Pro aren't marked per card on that page (Trade Assurance comes from the page's filter); a price in another currency than the page's £ isn't converted (Unit unclear, half the price points); the price per our unit needs one count in the title when the units differ.
- **Niches' any-term match**: a broad one-word search term ("fishing") accepts any title with that word in the category, so off-niche words carry more weight for such niches.
- **Niches' off-niche filter** is word-based: a real product whose title happens to say "kids" or "replacement" is left out, and an off-niche one without those words (a dry bag titled "fishing bag") still counts. Excluded products are listed under the check with the reason.
- **Niche Import's word flags** are whole-word matches on fixed lists, so broad words can misfire ("unit" in "air con unit"). Brands match as whole phrases (the term is the brand, starts with it, or has a 5+ character brand after a space), so "key ring" isn't Ring but a short brand later in a term ("outdoor tapo") is missed. The brand list is editable.
- **Opportunity Explorer growth** can be huge for one-off events: eclipse glasses read +56,382% over 180 days (the file's 563.8175 is a fraction, like the rest of the column). Anything over +150% is a spike.
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
- **A select returns at most 1,000 rows** (Supabase's max-rows), whatever `.range()` or `.limit()` asks. Any query that could pass 1,000 rows reads through `selectAll(table, cols, order, where)` / `allRows()` (`src/lib/server/db.ts`: a page at a time, ordered by a unique key) or is paged for the user. The FakeDb applies the same cap (`maxRows`, 1,000; lower it in a test to prove paging).
- **Every top-level page has a Help article** (the coverage test enforces it); new data tables sort through `useSortable`/`SortTh` (`src/components/SortableTable.tsx`).
- **Don't touch `scripts/.b.mjs`** (the user's).
