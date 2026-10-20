# UI redesign ("Calm Workbench"): summary

What changed between 19 and 20 Oct 2026, in five phases. The display changed, and so did how a few things are reached.
Scoring, stored values, export formats and the Ads bulk sheet logic did not change. The detail of each phase is in
[`STATUS.md`](STATUS.md) under "UI redesign"; the starting point is in [`ui-audit.md`](ui-audit.md).

## What changed in each phase

| Phase | What it did |
|---|---|
| 1. Audit (19 Oct) | Read-only audit of all 43 routes (57 views) at desktop and phone width: the sitemap, the sidebar, every page's tables, buttons and helper text, the overlaps, and the top problems. |
| 2. Foundations (19 Oct) | Design tokens in `globals.css`: the logo teal as primary, the amber as highlight, and soft + ink pairs for every status, in light and dark. IBM Plex Sans and Mono, and a 12–28px type scale. Shared building blocks: Button, PageHeader, InfoTip, DataTable, EmptyState and ErrorState, StatusChip/Verdict, Kpi. One grouped sidebar replaced the workspace switcher. A top bar with one status chip, and the ⌘K command palette. |
| 3a. Merges (19–20 Oct) | Overlapping pages merged into tabs. The sidebar went from 36 items to 27, and the old addresses redirect (308) to the new page and tab. |
| 3b. Restyle (20 Oct) | Every page got a PageHeader, DataTable tables, quiet row actions, deletes that confirm, and EmptyStates. One verdict vocabulary across the app (below). |
| 4a. Today (20 Oct) | Home became **Today**: ranked next steps (Later / Done), six key numbers, and Ask Scout (questions about your own data). |
| 4b. Pipeline (20 Oct) | Private label's home is the **Pipeline** board (Research → Validate → Sourcing → Launch → Live). Each candidate has its own page with tabs, and one launch flow (checklist → stock → ads plan → bulk file). |
| 4c. Results table (20 Oct) | One results table and filter bar for Run detail, Products, Shortlist and Brand detail. Filters live in the address, a column picker, a row click opens the details drawer, and each row is a card on a phone. |
| 5. Polish (20 Oct) | **Extension 0.8.0** uses the app's words and colours. Products' filters are fast (~4 s → under 0.5 s). Runs remember their filters again, Brand detail's drawer pushes the table aside, phones show 10 cards a page with Next and a page picker, My niches is cards on a phone, the Ads import previews are DataTables, and Today's "Add costs" opens the purchase. Accessibility: axe passes WCAG 2.1 AA on every route in light and dark (103 → 0 serious/critical), with focus rings, keyboard access and 44px phone targets. Consistency: hard-coded colours, off-scale sizes and one-off buttons are all gone (16 → 0, 2 → 0, 65 → 0), with shaped skeletons, Try again on errors, and Save waiting for a change. Speed: SheetJS and heavy tabs load on demand, and Today is cached for 60 s. Dead code removed. |

## Old → new addresses

Every old address still works: it answers 308 and lands on the new page and tab, with its query string kept.

| Old | New |
|---|---|
| `/` (Home) | `/` **Today** |
| `/upload` | `/new-run?tab=upload` |
| `/check` | `/new-run?tab=check` (`?asins=` prefills) |
| `/qogita` | `/new-run?tab=qogita` |
| `/hunt` | `/new-run?tab=hunt` |
| `/sellers/scan` | `/new-run?tab=seller` |
| `/favourites` | `/shortlist?tab=products` |
| `/watchlist` | `/shortlist?tab=watching` |
| `/tracker`, `/stock/orders` | `/stock/purchases` (`?edit=<id>` opens one purchase) |
| `/pl/niche-hunt` | `/pl/niches?tab=find` |
| `/pl/quotes` | `/pl/suppliers?tab=quotes` |
| `/pl/candidates?c=<id>` | `/pl/candidates/<id>` (`?tab=`, `?gate=`, `?step=`) |
| `/pl/launch` | the Launch tab of the candidate you're launching, else the Pipeline |
| `/pl` (was a redirect to Candidates) | `/pl` **Pipeline** board |
| `/ads/imports` | `/ads/dashboard?tab=imports` (`?import=1` opens the Import sheet) |
| `/ads/proposals/exports` | `/ads/proposals?tab=exports` |
| `/ads/keywords` | `/ads/search-terms?tab=keywords` |
| `/ads/ngrams` | `/ads/search-terms?tab=ngrams` |
| `/settings?tab=ads` | `/ads/rules?tab=settings` |

## The verdict words

The words are for display only. The database, the exports and the API still store `pass` / `warn` / `fail`. Every word
appears as a round chip with an icon as well as a colour.

| What | Words | Stored as |
|---|---|---|
| A wholesale product | **Buy** · **Check** · **Skip** · **Not scored** | pass · warn · fail · none (also buy / wait / skip on the product page) |
| A gate (wholesale gates, Private label gates and checks) | **Pass** · **Check** · **Fail** | pass · warn · fail |
| A Private label candidate | **Order samples** · **Check** · **Drop** | pass · warn · fail |
| A stock item | **In stock** · **Low** · **Out** | ok · low · out |

The Chrome extension uses the same words and colours from 0.8.0: Buy / Check / Skip / Not scored on product pages and
search results, and Pass / Check / Fail for each gate.

## How to find things now

- **Start at Today.** It lists the next steps across every workspace, the most useful first, each with a button that does the job. Under them are six key numbers.
- **One sidebar**, grouped by workspace: Wholesale (Runs, New run, Products, Suppliers, Shortlist; under More: Sellers, Brands, Plan), Private label (Pipeline, Candidates, Niches, Suppliers & quotes), Ads (Dashboard, Proposals, Launch, Search terms; under More: Rules, Review), Stock (Levels, Purchases, Reorder; under More: Movements, Sales, Import). Settings and Help sit at the bottom. On a phone the sidebar is a drawer that closes once you pick a page.
- **⌘K / Ctrl+K** jumps to any page, runs quick actions (check an ASIN, import an ads bulk file, new candidate, new run) and finds products, candidates and suppliers by ASIN, EAN or name.
- **Screening something new** is under **New run**, one tab per source: Upload file, Check ASINs, Qogita, Hunt, Scan a seller.
- **Products you're keeping an eye on** are in **Shortlist**: Products (the latest result each) and Watching (weekly re-checks and alerts).
- **What you've bought** is in **Stock → Purchases**, the old Tracker and Stock → Orders together.
- **A Private label product** lives on the Pipeline board. Open a card for its page, with tabs for Overview, Gates, Reviews, Suppliers & quotes, Listing and Launch.
- **Ads data in**: Dashboard → **Import**. **Ad settings**: Ads → Rules → Ad settings.
- **Results tables** (a run, Products, Shortlist, a brand) work the same everywhere. Filters live in the address, so a filtered view can be bookmarked. Click a row, or press Enter on it, to see its details beside the table. The **⋯** menu holds the row's actions, and **Columns** chooses what shows.
- **Help** (the **?** in the top bar, or Help in the sidebar) has an article for every page.
