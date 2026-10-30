# UI audit before the redesign (19 Oct 2026)

A read-only audit of every page as it is today, made before redesigning the UI. No app code was changed.

**How it was made.** `npm run dev`, signed in with the app's own Basic-auth password (`APP_PASSWORD` from `.env.local`), against the self-hosted database through the SSH tunnel (never Supabase Cloud). Playwright (Chromium) visited every route in `src/app` at 1440×900 and 390×844 and saved a full-page screenshot of each to `docs/ui-audit/screens/` (removed from the repo on 30 Oct; restore with `git checkout 422f20c -- docs/ui-audit/screens`) as `<route>-desktop.png` / `<route>-mobile.png`. Screenshots are clipped at 7,000 px tall; the real heights are in the table. The browser could only read: every POST/PATCH/DELETE to the app was aborted, except three read-only calls the pages need to render (`/api/sparks`, `/api/ads/rules/dry-run`, `/api/pl/hunt/estimate`). Detail pages use one real record each:

| Detail page | Record used |
|---|---|
| `/runs/[id]` | Qogita · Nail Care · 19 Oct (nightly) |
| `/products/[asin]` | B08677HMX4 (Vj Professional Nail Nippers) |
| `/brands/[key]` | maybelline |
| `/suppliers/[id]` | Qogita UK |
| `/pl/candidates?c=` | "Electrolyte sachets" (the list itself opens "Lens cleaning wipes") |
| `/ads/keywords?asin=`, `/ads/launch?asin=` | B0HM8FBX3T |
| `/help/[...slug]` | `pages/runs` |

The 11 Settings tabs are screenshotted one by one (`settings-<tab>`). The "helper paragraphs" counted below are visible paragraphs of 12 or more words in the page body (intros, captions, explanations), not counting table cells.

**Page count:** 43 `page.tsx` routes. That is 57 distinct views, counting the 11 Settings tabs, the candidate and Ads `?asin=` detail views and the 404 page, and 114 screenshots.

---

## a. Sitemap

The sidebar has a workspace switcher (Wholesale · Private label · Ads · Stock, Alt+Shift+W) at the top. Home sits above the workspace's menu, and Settings and Help sit at the bottom of every workspace.

| Workspace | Menu item | Route | What the page is for |
|---|---|---|---|
| Shared | Home | `/` | Tiles for each workspace at a glance (Keepa tokens, watchlist, candidates, ad spend, stock value), recent runs, Qogita overnight, brands to chase |
| Wholesale | Runs | `/runs` | Every screening run (uploads, Qogita pulls, ASIN checks, watchlist re-checks, seller scans) with its pass/warn/fail bar |
| | (detail) | `/runs/[id]` | One run's results table: filters, columns, row drawer, re-screen, export, delete |
| | Upload | `/upload` | Drop supplier price lists, map their columns, review, start a run (4-step wizard) |
| | Check ASINs | `/check` | Paste ASINs/EANs/links with an optional cost and screen them; recent checks below |
| | Qogita | `/qogita` | Pull in-stock Qogita products by category/brand and screen them; saved pulls with nightly re-pull |
| | Sellers | `/sellers` | Storefronts you've scanned, their brand mix and how their listings screened |
| | (sub-page) | `/sellers/scan` | Scan one seller's storefront (seller ID or URL) |
| | Brands | `/brands` | Every screened brand scored for wholesale-friendliness, with gating and IP risk |
| | (detail) | `/brands/[key]` | One brand: approval status, documents, top sellers, every product across runs |
| | Suppliers | `/suppliers` | Supplier ledger: type, stock, runs, products, terms, paperwork, rating |
| | (detail) | `/suppliers/[id]` | One supplier's terms form, documents, best products, brands carried, runs |
| | Favourites | `/favourites` | Starred products with their latest result (same results table as a run) |
| | Watchlist | `/watchlist` | Products waiting on a condition, re-checked weekly; what now passes |
| | Plan | `/plan` | Order plan: which products and quantities make the most profit within the budget |
| | Hunt | `/hunt` | Keepa Product Finder for wholesale-shaped products before you have a supplier |
| | Products | `/products` | Every product the app has screened, newest first, with its latest verdict |
| | (detail) | `/products/[asin]` | One product: decision, history charts, suppliers, purchases, paperwork, latest screening |
| | Tracker | `/tracker` | Purchases with the prediction frozen at purchase vs what Amazon reports |
| Private label | Candidates | `/pl/candidates` (`?c=<id>`) | The whole candidate workspace: list, 8 gates, scorecard, waivers, suppliers, quotes, listing, reviews |
| | Niche Hunt | `/pl/niche-hunt` | Keepa Product Finder grouped by leaf category: niches that pass Gates 0–1, turned into candidates |
| | Niches | `/pl/niches` | Opportunity Explorer niche imports (CSV), scored, filtered, shortlisted |
| | Suppliers | `/pl/suppliers` | Alibaba listings captured by the extension, scored against each candidate's targets |
| | Quotes | `/pl/quotes` | Supplier quotes side by side as landed cost per unit; choose one; send the RFQ |
| | Launch | `/pl/launch` | Launch checklist from samples to first review, per candidate ready to launch |
| Ads | Dashboard | `/ads/dashboard` | Per-product spend, ACoS, break-even, AI explanation, campaigns, keywords, search terms |
| | Imports | `/ads/imports` | Drop the Amazon Ads bulk export / CSV reports; past imports with Undo |
| | Rules | `/ads/rules` | The 13 rules that raise proposals: on/off, thresholds, mode, dry run |
| | Proposals | `/ads/proposals` | What the rules suggest: approve, skip, snooze; export the bulk sheet |
| | (sub-page) | `/ads/proposals/exports` | Bulk-sheet batches (download, mark uploaded, revert, discard) and snapshots |
| | Keywords | `/ads/keywords` (`?asin=`) | Keyword bank per product: OE terms, harvested, n-gram winners, rank-tracked, your own |
| | N-grams | `/ads/ngrams` | Search terms split into words/pairs with their spend, orders and waste |
| | Launch | `/ads/launch` (`?asin=`) | Build a new product's four launch campaigns as one bulk sheet |
| | Review | `/ads/review` | Claude's monthly review: three ranked recommendations, by product, account-wide |
| Stock | Levels | `/stock/levels` | What you hold per item and bucket (self-ship, FBA, TikTok FBT), value, days of cover |
| | Movements | `/stock/movements` | Ledger of receipts, sales, returns, adjustments, transfers; audit log |
| | Sales | `/stock/sales` | Sales outside Amazon (eBay, TikTok, website, in person) |
| | Orders | `/stock/orders` | Purchases of stock items; Receive puts units into a bucket |
| | Reorder | `/stock/reorder` | Reorder point and suggested quantity from the last 30 days' sales |
| | Import | `/stock/import` | Import StockPilot JSON or an items CSV |
| Shared | Settings | `/settings?tab=` | 11 tabs: Business, Gates, Score, Fees, Profiles, Waived, IP risk, Filter sets, Private label, Ads, Stock |
| Shared | Help | `/help` | Help centre index: every page, gate, how-to and reference article |
| | (article) | `/help/[...slug]` | One help article (also opened in the side panel by the top bar's `?`) |
| — | (none) | 404 | Not-found page with "Go home" |

The top bar has the sidebar toggle, breadcrumbs, a product search (ASIN, EAN or name), status dots (Supabase, SP-API, Gating, Keepa), the Keepa token balance, the Qogita cart, the Help `?` (opens this page's article in a side panel) and the theme toggle.

---

## b. Sidebar items and icons

All icons are from lucide-react, mapped in `ICON` in `src/components/AppShell.tsx`. A route missing from that map falls back to `CircleHelpIcon` (the "?"), which is also Help's own icon.

| Workspace | Item | Icon | Flag |
|---|---|---|---|
| Shared | Home | `HomeIcon` | |
| Shared | Settings | `SettingsIcon` | |
| Shared | Help | `CircleHelpIcon` | the "?" (correct here, but every fallback below looks identical to it) |
| Wholesale | Runs | `ListChecksIcon` | |
| Wholesale | Upload | `UploadIcon` | |
| Wholesale | Check ASINs | `ScanSearchIcon` | Sellers' "Scan a seller" button uses `ScanSearch` too |
| Wholesale | Qogita | `DownloadCloudIcon` | |
| Wholesale | Sellers | `StoreIcon` | |
| Wholesale | Brands | `BuildingIcon` | duplicate: Settings → Business tab uses `BuildingIcon` |
| Wholesale | Suppliers | `TruckIcon` | Stock's "Record a new order" button also uses a truck |
| Wholesale | Favourites | `StarIcon` | |
| Wholesale | Watchlist | `EyeIcon` | |
| Wholesale | Plan | `ClipboardListIcon` | |
| Wholesale | Hunt | `CrosshairIcon` | |
| Wholesale | Products | `BoxesIcon` | duplicate: the Stock workspace's switcher icon and Settings → Stock tab are `BoxesIcon` |
| Wholesale | Tracker | `PackageIcon` | |
| Private label | Candidates | `TagIcon` | duplicate: the Private label switcher icon and Settings → Private label tab are `TagIcon` |
| Private label | Niche Hunt | `TelescopeIcon` | |
| Private label | **Niches** | `CircleHelpIcon` | **⚠ generic "?" (no icon mapped)** |
| Private label | **Suppliers** | `CircleHelpIcon` | **⚠ generic "?"** (Wholesale's Suppliers has `TruckIcon`) |
| Private label | Quotes | `ReceiptIcon` | duplicate: Settings → Fees tab is `ReceiptIcon` |
| Private label | Launch | `RocketIcon` | Ads → Launch, the same idea, has the "?" instead |
| Ads | Dashboard | `GaugeIcon` | duplicate: Settings → Score tab is `GaugeIcon` |
| Ads | Imports | `FileUpIcon` | |
| Ads | Rules | `ListFilterIcon` | |
| Ads | Proposals | `LightbulbIcon` | |
| Ads | **Keywords** | `CircleHelpIcon` | **⚠ generic "?"** |
| Ads | **N-grams** | `CircleHelpIcon` | **⚠ generic "?"** |
| Ads | **Launch** | `CircleHelpIcon` | **⚠ generic "?"** |
| Ads | **Review** | `CircleHelpIcon` | **⚠ generic "?"** |
| Stock | **Levels** | `CircleHelpIcon` | **⚠ generic "?"** |
| Stock | **Movements** | `CircleHelpIcon` | **⚠ generic "?"** |
| Stock | **Sales** | `CircleHelpIcon` | **⚠ generic "?"** |
| Stock | **Orders** | `CircleHelpIcon` | **⚠ generic "?"** |
| Stock | **Reorder** | `CircleHelpIcon` | **⚠ generic "?"** |
| Stock | **Import** | `CircleHelpIcon` | **⚠ generic "?"** |

**12 of the 36 menu items (33 workspace items plus Home, Settings and Help) show the "?" fallback**, the same glyph as Help. The whole Stock sidebar is six "?"s (see `stock-*-desktop.png`), and with the sidebar collapsed to icons those items can't be told apart. The workspace switcher's icons are `Package`/`Tag`/`Megaphone`/`Boxes` (in `WorkspaceSwitcher.tsx`). On the desktop the active workspace's label is truncated ("Private la…").

---

## c. Per page

Height is the full page height at 1440 wide; 900 means it fits in one screen (the results tables scroll inside their own card). Mobile height is at 390 wide. "Primary action" is the main thing the page is for, whatever the button's style.

### Shared

| Page | Main purpose | Primary action | Helper ¶ | Height (desktop / mobile) | Problems |
|---|---|---|---|---|---|
| Home `/` | Workspace overview | Upload price list (top right, the only filled button) | 8 | 1,700 / 3,733 | The tiles are mixed sizes; the Ads "Review" tile's 4-line headline makes its row 2× taller. The only call to action is Wholesale's, though there are four workspaces. Recent-runs bars are almost all red, with no story. |
| Settings (Gates) `/settings` | Profiles: the gates | Save (top right, disabled until changed) | 4 | 7,514 / 12,302 | **11 tabs** in one strip (it scrolls sideways on mobile). The Gates tab is a 7.5k px form with ~145 inputs; Compliance rules are 12 near-identical expanded cards. A separate "Save rules" button sits halfway down. |
| Settings → Business | VAT, price basis, Qogita region, launch capital, Recalculate all | Save, then Recalculate all | 9 | 2,001 / 2,514 | Every block has a 2–4 line explanation. Save sits between the sections and Recalculate. The Recalculate table is a 20-row report inside a settings page. |
| Settings → Score | Score weights per group | Save | 5 | 2,826 / 6,183 | 205 inputs; 24 xs outline buttons. |
| Settings → Fees | Rate card and fee settings | Save | 4 | 1,321 / 1,943 | — |
| Settings → Profiles | Screening profiles: copy, switch, default | Save | 5 | 1,191 / 1,405 | 16 ghost xs buttons in a table. |
| Settings → Waived | Every waived gate, un-waive | Un-waive (per row) | 2 | 3,010 / 10,018 | A 44-row list with no search or filter. |
| Settings → IP risk | IP-risk brand list | Add | 3 | 2,570 / 3,108 | 225 inputs (every row editable inline); 36 icon buttons. |
| Settings → Filter sets | Saved filter sets | (none) | 3 | 900 / 844 | Empty, with no way to create a set from here. |
| Settings → Private label | Private label settings | (Save inline) | 6 | 1,706 / 2,764 | — |
| Settings → Ads | Ads settings, keyword lists, review schedule | (Save inline) | 8 | 1,386 / 2,349 | Overlaps Ads → Rules (both are rule configuration). |
| Settings → Stock | Stock settings | (Save inline) | 2 | 900 / 844 | — |
| Help `/help` | Help centre index | Search | (65 article blurbs) | 4,039 / 5,570 | A long index; it duplicates the top bar's `?` panel. The page has a narrow content column, unlike the rest of the app. |
| Help article | One article | (read) | 23 | 6,274 / 9,698 | A reference wall (7 tables); no in-page table of contents. Help pages do have breadcrumbs. |
| 404 | Not found | Go home | 1 | 900 / 844 | — |

### Wholesale

| Page | Main purpose | Primary action | Helper ¶ | Height | Problems |
|---|---|---|---|---|---|
| Runs | List of runs | (none: the "…" menu; no "New run") | 1 | 2,860 / 4,885 | **No primary action** (no New run / Upload button). One-row "ASIN check" runs (most of the list) bury the price-list runs. 159 buttons (a `…` per row). The "stale" chips repeat on almost every row. No breadcrumb. |
| Run detail | A run's results | Re-screen / Export | 4 | 900 / 931 | Two rows of 13 filter chips and dropdowns above the table. The filled pink "Delete" sits beside Re-screen/Export at equal weight. The table is wider than the screen (the right half is hidden). The verdict chips here are "fail"; the product page says "SKIP". |
| Upload | Price-list wizard | Map columns (disabled until a file is dropped) | 1 | 900 / 844 | Narrow centred column (`max-w-4xl`) unlike its neighbours; the disabled primary is a pale teal pill that reads as "loading". Title "Upload price lists" ≠ nav "Upload". No breadcrumb. |
| Check ASINs | Paste and screen | Check (disabled pale until text) | 2 | 1,635 / 1,848 | "Recent checks" (20 rows, each with Re-run) repeats the Runs list. Narrow layout like Upload. |
| Qogita | Pull and screen | Pull and screen | 2 | 900 / 1,910 | Title "Pull from Qogita" ≠ nav. 9 inputs before the action. Saved pulls are cards, while Runs/Check show the same kind of thing as rows. No breadcrumb. |
| Sellers | Scanned storefronts | Scan a seller | 2 | 900 / 844 | One row; the rest of the screen is empty. Brand-mix chips are outlined pills, unlike the badges elsewhere. |
| Sellers → Scan | Scan one seller | Scan | 1 | 900 / 844 | A one-field page; could be a dialog. |
| Brands | Brand list by score | (none) | 1 | **8,049** / 9,045 | **200 rows, no pagination**; 200 status chips. The page heading area is 2 lines of explanation plus a long filter row. |
| Brand detail | One brand | Mark approved / Apply on Amazon / Apply kit | 3 (plus product text) | **19,744** / **29,836** | **The longest page in the app**: all 273 Maybelline products unpaginated. Approval, documents and sellers are squeezed into the first screen; three different button styles in the header. |
| Suppliers | Supplier ledger | (none: no "Add supplier") | 1 | 1,100 / 1,213 | No add action. The "Paperwork" column is a run of dashes ("IoR — · — · invoice —"). The Brands column wraps into 4-line cells. |
| Supplier detail | Terms, documents, products | (auto-save form; Attach files) | 1 | 1,581 / 2,845 | A 13-field form opens the page, before the supplier's results. A third "documents" uploader (also on Brand and Product). |
| Favourites | Starred products | Re-screen favourites | 4 | 900 / 865 | The same toolbar, chips and table as Run detail. The same 4 products as Watchlist. |
| Watchlist | Waiting-on list | Re-check now (outline) | 6 | 900 / 1,014 | A 3-line intro plus an email-alerts banner; "Now passes" is an empty card with no next step. Overlaps Favourites. |
| Plan | Order plan | Export xlsx / Record as bought | 2 | 900 / 1,056 | Title "Order plan" ≠ nav "Plan". A 4-line intro. "Record as bought" is a tiny outline chip inside the table header row. |
| Hunt | Keepa Product Finder (wholesale) | Hunt | 2 | 900 / 1,068 | Narrow centred column. The cost block is good, but the Hunt button sits at the bottom-left of a card, unlike Qogita's bottom-right. |
| Products | All screened products | Record a purchase | 1 | 3,343 / 4,998 | The primary button ("Record a purchase") isn't what the page is about. The filter chips (All/Pass/Warn/Fail/Bought) are a different control from the Run filter chips. Prev/Next paging, while Brands has none. |
| Product detail | One product's decision | Watch / Record a purchase / Re-check | 3 | 1,676 / 3,051 | The verdict says **SKIP / Buy / Wait** while everywhere else says pass/warn/fail. "Re-check" appears twice. A wide 3-column "Latest screening" block. The Price chart is empty with a sentence in the middle. |
| Tracker | Purchases vs reality | Record a purchase | 1 | 1,025 / 1,555 | Three header buttons (Sync now, Record a stock order, Record a purchase): two "record" actions. Rows mix a status dropdown, Edit, Delete and a Stock link. It overlaps Stock → Orders. |

### Private label

| Page | Main purpose | Primary action | Helper ¶ | Height | Problems |
|---|---|---|---|---|---|
| Candidates | Score a candidate through 8 gates | New candidate / Refresh from Keepa (both filled) | **16** | **14,745** / **19,664** | **Everything on one page**: gates 0–7 (each a card of fields, checks and copy), the 10-line scorecard, waivers, the full supplier table (57 rows), quotes, listing writer and review miner. 345 buttons and 5 filled "primary" buttons. Fixed font sizes `text-[10px]`/`[11px]`/`[11.5px]` throughout. |
| Candidate (`?c=`) | The same page, another candidate | as above | 15 | 6,001 / 9,711 | **Overflows on mobile**: the 450 px candidate sidebar pushes the page wider than 390. |
| Niche Hunt | Find niches via Keepa | Hunt niches | 6 | **8,290** / 11,183 | A dense filter panel (two columns, 15 inputs, a chip cloud of categories), then 141 rows, each with a filled "Create candidate" button (**141 identical primary buttons**). Overlaps Niches. |
| Niches | Opportunity Explorer imports | Preview (import) | 2 | **9,888** / 10,611 | 100 rows × 15 columns at 11 px; 110 inputs. The page is a CSV importer and a niche list together. Overlaps Niche Hunt. |
| Suppliers (PL) | Alibaba listings scored | (none) | 1 | **7,111** / 7,232 | 57 rows with no pagination; 245 hand-rolled buttons. **The same table appears on Candidates and Quotes.** No breadcrumb. The "?" sidebar icon. |
| Quotes | Compare quotes | Add quote | 4 | **7,499** / 7,976 | The quote table is 1 row, then the full Alibaba supplier table again (57 rows), the third copy. |
| Launch (PL) | Launch checklist | (none until a candidate qualifies) | 2 | 900 / 844 | An empty state with a long sentence; nothing to do until another page changes. Different from Ads → Launch, though both are "Launch". |

### Ads

| Page | Main purpose | Primary action | Helper ¶ | Height | Problems |
|---|---|---|---|---|---|
| Dashboard | Ads performance per product | Import reports / Fetch stock (outline) | 7 | **8,307** / **17,170** | 10 stat tiles, then an AI explanation as a wall of text, then campaigns, keywords (30 rows) and search terms (100+ rows) all expanded. No primary filled action. |
| Imports | Upload ad reports | (drop zone) | 2 | 900 / 1,029 | A 3-line technical intro; a "Dashboard" outline button as navigation. Red "Undo" text links. Overlaps Dashboard's "Import reports". |
| Rules | Configure the 13 rules | Dry run with these settings | **17** | 2,913 / 6,454 | Every rule card has a 2–3 line explanation plus "Each change waits for your approval" (×13). The cards have unequal heights in a 2-column grid. Overlaps Settings → Ads. |
| Proposals | Approve rule suggestions | Export bulk sheet (disabled) / Approve | 3 | 900 / 1,688 | The main button is disabled until approvals exist, and "Approve all high-confidence" is an outline button far right. The n-gram chips duplicate N-grams. |
| Bulk exports | Batches and snapshots | Mark batch as uploaded / Snapshot now | 2 | 900 / 1,065 | **Overflows on mobile** (965 px table). Four kinds of action styling in one row (outline, text, filled, red text). |
| Keywords | Keyword bank per product | Add | 2 | 900 / 844 | A 4-line intro over a 1-row table. With `?asin=B0HM8FBX3T`, **the picker shows B0H9ZKYYHZ while the bank is B0HM8FBX3T's** (that ASIN isn't in the picker's list), so the label and the data disagree. |
| N-grams | Waste by word/pair | (none) | 1 | **11,167** / **22,228** | 215 rows, no pagination; the longest page on mobile after Brand detail. |
| Launch (Ads) | Build launch campaigns | (none visible: the preview fills in after the form) | 2 | 1,025 / 1,245 | A blank form with "Fill in … to see the campaigns" on the right; no obvious create/export button until filled. |
| Launch `?asin=` | The same, prefilled | — | 3 | 1,061 / 1,313 | — |
| Review | Claude's monthly review | Re-run (outline) | 8 | 1,232 / 2,224 | Long prose blocks (By product, Account-wide) of 6–8 lines each. Title "Monthly review" ≠ nav "Review". |

### Stock

| Page | Main purpose | Primary action | Helper ¶ | Height | Problems |
|---|---|---|---|---|---|
| Levels | Stock per item and bucket | New item / Record a new order | 2 | 900 / 1,985 | A 4-line intro. **The table has no white panel** (it sits on the grey ground, unlike every other table). Days of cover shows as "— · — · — · —". |
| Movements | Ledger | Export CSV | 1 | 900 / 1,500 | 3-line intro; Ledger / Audit log toggles look like filter chips. Edit/delete are icon-only. |
| Sales | Off-Amazon sales | Record sale | 1 | 900 / 844 | The empty state uses the app logo as its icon. |
| Orders | Stock purchases | Record a new order | 1 | 900 / 844 | The same records as the Tracker (it says so). Grey "Delete" text next to outline "Receive". |
| Reorder | Reorder suggestions | (none) | 1 | 900 / 1,589 | A 3-line formula as the intro; the status chip "no demand" wraps onto two lines. |
| Import | StockPilot / CSV import | (drop zone) | 2 | 900 / 844 | A different tab style (segmented pill) from Settings (line tabs). The fourth separate drop zone design in the app. |

---

## d. Overlaps and merge candidates

1. **Upload / Check ASINs / Qogita / Hunt / Sellers → Scan**: five ways to start a wholesale screening run, each its own page with its own layout (narrow wizard, narrow paste form, wide form plus cards, narrow form, one-field page). All of them end in Runs. *Merge into one "New run" page with a source picker (File · ASINs · Qogita · Keepa Hunt · Seller storefront)*, with saved Qogita pulls as a section of it.
2. **Runs vs Check ASINs' "Recent checks" vs Products**: three lists of screened things. Check's recent list is a filtered Runs list; one-item "ASIN check" runs flood Runs. *Runs shows runs (with ASIN checks folded into one group), and Products is the per-product view.*
3. **Favourites vs Watchlist**: both are "products I'm keeping an eye on" (today the same 4 products), with two pages and two tables. *One "Shortlist" page with a Watching filter and the condition as a column.*
4. **Run detail / Favourites / Brand detail / Products**: four tables of products and results with different filters and columns (the results table with chips on two, a plain table on the other two). *One results table component and one filter bar everywhere.*
5. **Wholesale Suppliers / Private label Suppliers / Stock's "From Stock" suppliers**: three supplier concepts. PL Suppliers are Alibaba listings, not supplier records. *One supplier directory with a type; Alibaba listings belong to a candidate.*
6. **PL Suppliers vs Quotes vs the Candidates page's Suppliers section**: the **same 57-row Alibaba table is rendered three times**. *Keep it once, on the candidate; Quotes becomes a tab of the candidate.*
7. **Niche Hunt vs Niches**: two sources of niches (Keepa, Opportunity Explorer), two pages, two tables and two "Create candidate" flows. *One Niches page with a source filter and an Import / Hunt action.*
8. **Private label Launch vs Ads Launch**: "Launch" twice, in two workspaces; the PL checklist links to the Ads launcher with the candidate prefilled. *One launch flow (checklist then campaigns), linked from both.*
9. **Ads Imports vs Dashboard**: Dashboard already has "Import reports"; Imports is a drop zone plus a 4-row history. *Fold imports into the Dashboard as a "Data" panel or dialog.*
10. **Ads Rules vs Settings → Ads**: rule configuration in two places. *Move rule settings into Settings → Ads, or make Rules the only home.*
11. **Ads Proposals vs Bulk exports**: approve → export → mark uploaded is one pipeline split over two pages. *One page with Pending / Exported tabs.*
12. **Ads Keywords vs N-grams vs Dashboard search terms**: three term tables for the same data. *One "Terms" page with Keyword bank / N-grams / Search terms tabs.*
13. **Tracker vs Stock → Orders**: the same purchase records ("one record each"), both with "Record …" buttons. *One Purchases page; Tracker's prediction-vs-actual becomes its columns.*
14. **Four import drop zones** (Upload, Ads Imports, Stock Import, Niches CSV) and **three document uploaders** (Brand, Supplier, Product): *one Dropzone and one Documents component.*
15. **Help page vs the Help side panel**: the same articles; the `?` in the top bar already opens the page's article.

---

## e. UI building blocks in use

The base is **shadcn/ui** (style `radix-nova`, Radix primitives) in `src/components/ui/`, themed in `src/app/globals.css`. Counts are JSX occurrences in `src/app` and `src/components`, outside `ui/`.

**Buttons.** `ui/button.tsx` (cva) has the variants default, outline, secondary, ghost, destructive and link, and the sizes default, xs, sm, lg, icon, icon-xs, icon-sm and icon-lg.
- Variants passed: default (implicit) on about 80, outline ×135, ghost ×92, link ×3, destructive ×1. **Secondary is never used.**
- Sizes passed: xs ×96, sm ×81, icon-sm ×12, icon ×6, icon-xs ×6, lg ×3, so most buttons are xs/sm (24–28 px).
- **91 hand-rolled `<button>`s** in 39 files sit beside 311 `<Button>`s: filter chips, candidate list items, table "…" menus, segmented toggles (Comfortable/Compact, any/yes/no), "Undo"/"Delete" text links.
- Destructive actions have three looks: the filled pink `destructive` (Run → Delete), red text ("Undo", "Discard (never uploaded)") and grey text or trash icon (Stock Orders/Levels).
- A disabled primary renders as a pale teal pill (Upload, Check, Qogita, Proposals' Export), which reads as loading rather than not-ready.

**Tables.** There are five kinds:
1. shadcn `ui/table.tsx` (`<Table>`, 13 files);
2. raw `<table>` (51 tables in 30 files) with per-file classes;
3. the TanStack/virtual **ResultsTable** (`components/results/ResultsTable.tsx`: pinned product column, `.results-scroll`, row variables, density toggle, columns menu), used on Run detail and Favourites;
4. the `.table-wrap` / `.table-scroll` / `.sticky-th` container-query tables;
5. help-prose tables.

Sorting is shared (`SortableTable.tsx`: `useSortable`, `SortTh`, `SortTableHead`, in 35 files). Header styles differ:
- Wholesale uses muted sentence-case 14 px;
- Ads, Stock and Private label use `uppercase text-[11px] tracking` (30 files carry `uppercase`);
- ResultsTable uses uppercase bold.

The verdict edge (`tr[data-verdict]`) is a 4 px left bar on the first cell. Pagination exists only on Products (Prev/Next) and Niches (First/Prev/Next/Last plus page size).

**Cards and panels.** The shadcn `<Card>` is barely used (6 uses in 2 files). The real card is the `panel` utility (rounded-lg, 1 px border, card background, no shadow, about 107 uses) plus about 87 hand-written `rounded-* border` divs. Stat tiles have three variants: Home's icon tiles, the run/plan/tracker strips with `eyebrow` + `stat-value`, and the Ads dashboard's 10-up tiles. On the Candidates page, gate cards are numbered collapsibles with coloured status pills.

**Badges and chips.**
- `ui/badge.tsx` has the extra variants pass/warn/fail/brand/muted (67 uses: muted 15, warn 10, brand 9, pass 7, fail 4, outline 4).
- `VerdictBadge` (pass/warn/fail), `StatusPill`/`Dot`/`SourceChip` (`components/pl/bits.tsx`, Private label only), `VatTag` (VAT reg./Non-VAT, `text-[9.5px]`).
- **43 hand-rolled `rounded-full px-…` pills**: brand-mix chips, category chips, filter chips, "stale", "waived", "bought", "targeted exact", "no demand".
- The verdict vocabulary is inconsistent:
  - **pass / warn / fail** in tables;
  - **SKIP / Buy / Wait** on the product page;
  - **Order samples / check / drop** in Private label;
  - **ok / out / no demand** in Stock.

**Empty states.** `EmptyState` (`components/States.tsx`: an icon, or the app logo when none is given, plus title, text and action) has 26 uses; `ErrorState` has 38. Many pages instead write a muted sentence in a panel: Watchlist "Nothing new…", PL Launch, Keywords, Launch preview, Supplier detail's stock note. Skeletons (`ui/skeleton.tsx`) cover loading.

**Form inputs.**
- shadcn: `Input` ×169, `NativeSelect` ×90 (native `<select>` styled; the only select used), `Textarea` ×22, `Switch` ×15, `Checkbox` ×8, `ToggleGroup` ×8, `RadioGroup` ×1, `Slider` ×1.
- Raw elements: `<input>` ×25 (checkboxes in tables, file inputs, date inputs), `<textarea>` ×10, `<select>` ×1.
- `field-label` is the label utility.
- Date inputs are the browser's own (`dd/mm/yyyy` with a calendar icon), which look different on every OS.

**Overlays and feedback.** `Dialog` (8 files), `Sheet` (3: the results drawer, the help panel, the stock item drawer), `Popover` (6), `Tooltip` (3), `AlertDialog` through `useDialogs()` (27 confirms, with no `window.confirm`), `DropdownMenu`, Sonner toasts (bottom-right, rich colours; only 1 file calls `toast()` directly), and `<details>/<summary>` disclosures ×15 (plain browser triangles: "Not in the plan", "What the rules couldn't check", "Keepa query").

**Tabs.** `ui/tabs.tsx` has a `line` variant (Settings) and the default segmented style (Stock Import). Run filters and Movements use buttons that look like tabs.

**Typography.**
- Fonts (`next/font/google` in `src/app/layout.tsx`):
  - **Bricolage Grotesque** 500/600/700 for headings and stat values (`--font-heading`);
  - **IBM Plex Sans** 400–700 for body (`--font-sans`, 14 px / 1.45);
  - **IBM Plex Mono** 400–600 for figures, ASINs, EANs and code (the `.num` class, tabular).
- Utilities: `page-title` (2xl bold, 45 uses), `section-title` (5), `section-label` (xs uppercase tracked, 40), `eyebrow` (2xs uppercase, 10), `stat-value` (22 px, 6), `text-2xs` (11 px).
- **Off-scale sizes hard-coded:**
  - `text-[11px]` ×56 in 29 files (every Ads, Stock and Private label page);
  - `text-[10px]` ×26 in 12 files;
  - `text-[10.5px]` ×13 in 8 files;
  - `text-[11.5px]` ×6 (`pl/ListingSection`, `pl/Workspace`);
  - `text-[9.5px]` ×2 (`ResultsTable`, `VatTag`);
  - `text-[22px]` (`stat-value`), `text-[0.8rem]` (the button sm size).

**Colours.** The tokens in `src/app/globals.css` (`:root` / `.dark`) are the only colours in `src/` except those listed below.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ground` | `#F4F6F7` | `#111820` | page background |
| `--surface` | `#FFFFFF` | `#18212B` | cards, sidebar, popovers |
| `--surface-2` | `#EDF1F3` | `#1F2A36` | muted / secondary / hover |
| `--line` | `#D6DEE3` | `#2C3946` | borders |
| `--line-strong` | `#B9C5CC` | `#3D4C5B` | input borders |
| `--ink` | `#1C2534` | `#E7ECF0` | text |
| `--ink-2` | `#3E4B58` | `#C2CCD5` | sidebar text |
| `--muted-ink` | `#6B7883` | `#8E9CAA` | muted text |
| `--accent-strong` | `#0B8CA0` | `#2FB3C7` | primary, ring, brand, links |
| `--accent-ink` | `#FFFFFF` | `#0B1418` | text on primary |
| `--accent-soft` | `#DDF1F4` | `#163A42` | active nav, selected row |
| `--pass` / `-soft` | `#1E8E5A` / `#DDF3E7` | `#3FC07E` / `#153826` | pass |
| `--warn` / `-soft` | `#B86E00` / `#FCEBCF` | `#E39A2E` / `#3E2B0C` | warn |
| `--fail` / `-soft` | `#C2382F` / `#F9DEDB` | `#EF6B62` / `#44201D` | fail, destructive |
| `--empty` / `-soft` | `#8A97A2` / `#E9EDF0` | `#7C8894` / `#232E39` | grey / no data |

Colours set outside the tokens:
- `src/app/manifest.ts`: `#2F7F8C` (theme colour), `#ffffff`.
- `public/logo.svg` and `src/app/icon.svg`: `#2F7F8C` (tile), `#F2B544` (amber bars), `#fff`. **The logo's teal (#2F7F8C) is not the UI's accent (#0B8CA0).**
- Tailwind palette classes:
  - `text-amber-700 dark:text-amber-400` in `src/app/pl/niches/page.tsx:420` (should be `text-warn`);
  - `text-white` ×10, for example the `BAND_STYLE` in `ResultsTable.tsx:88` and the filter chips in `pl/niches/page.tsx:271` and `pl/Suppliers.tsx:59`;
  - `bg-white` in `ProductThumb.tsx` (product images) and `ui/slider.tsx`;
  - `bg-black/10` in the dialog, sheet and alert-dialog overlays.
- Inline style: `style={{ background: s.colour }}` (1 use, a series colour).
- **Chrome extension** (`extension/*.js`, `popup.html`), outside the app's tokens. It uses Tailwind zinc/emerald/amber/red hex literals: `#0b8ca0`, `#0f766e`, `#15803d`, `#b45309`, `#b91c1c`, `#111`, `#3f3f46`, `#52525b`, `#71717a`, `#d4d4d8`, `#e4e4e7`, `#f4f4f5`, `#fef3c7`, `#fff`, plus `#2F7F8C`/`#F2B544` for the mark. So it has two teals (`#0b8ca0` in alibaba/poe/reviews, `#0f766e` in popup/product/sellercentral).
- Unused Next starter SVGs in `public/` (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) carry `#000`/`#666`/`#fff`.

**Radius.** `--radius` is 0.625 rem (10 px), with sm 6 / md 8 / lg 10 / xl 14. Buttons use `rounded-[min(var(--radius-md),10px|12px)]`.

**Icons.** lucide-react throughout (the app and Settings tabs).

---

## f. Styling stack and where things live

- **Tailwind CSS v4** (CSS-first config: `@import "tailwindcss"`, `@theme inline`, `@utility`, `@custom-variant dark`, no `tailwind.config.*`), with PostCSS (`postcss.config.mjs`). Also `tw-animate-css` and `shadcn/tailwind.css`.
- **shadcn/ui** components (`components.json`: style `radix-nova`, base colour neutral, CSS variables, icon library lucide) built on the **`radix-ui`** package, with `class-variance-authority` + `clsx` (`cn()` in `src/lib/utils.ts`). No CSS modules, no styled-components, no other component library.
- **next-themes** for light/dark (class on `<html>`), toggled by `src/components/ThemeToggle.tsx`. **Sonner** for toasts. **TanStack Table + Virtual** for the results table. **marked** renders the Help markdown.
- Global CSS: `src/app/globals.css` holds the tokens, type scale, utilities (`panel`, `page-title`, `section-title`, `section-label`, `eyebrow`, `stat-value`, `field-label`, `.num`), table scrolling/sticky rules, results-row colours and `.help-prose`.
- Fonts: `src/app/layout.tsx` (`next/font/google`).
- **Layout shell:** `src/app/layout.tsx` wraps every page in `<Providers>` (`src/components/Providers.tsx`: theme, tooltips, dialogs, toaster) and `<AppShell>` (`src/components/AppShell.tsx`).
  - **Sidebar**: `AppSidebar` in AppShell, on `src/components/ui/sidebar.tsx` (13 rem wide, collapsible to icons, remembered in the `sidebar_state` cookie).
  - **Menu data**: `src/lib/workspaces.ts` (`WORKSPACES`, `SHARED_NAV`).
  - **Workspace switcher**: `src/components/WorkspaceSwitcher.tsx`.
  - **Page icons**: the `ICON` map in AppShell.
- **Header** (also in AppShell): `SidebarTrigger`, `Crumbs` (each page sets them with `usePageCrumbs`, in `src/components/Crumbs.tsx`), `ProductSearch` (`components/product/`), `StatusBar` (in AppShell), `QogitaCartButton` (`components/QogitaCart.tsx`), `HelpButton` (`components/help/`), `ThemeToggle`. The content column is `max-w-[1400px]`, `px-4 lg:px-6`, `py-6`. Some pages narrow it themselves (`max-w-4xl`/`5xl`: Upload, Check, Sellers → Scan, Ads Review; Hunt is centred too).
- Shared app components: `src/components/` (States, SortableTable, FilterBar, BulkBar, VerdictBadge, VerdictBar, VatTag, ProductThumb, Dialogs, Logo, EditableName, FavouriteStar, WaiveControl, DgReport, ComingSoon), plus per-area folders `results/`, `pl/`, `ads/`, `stock/`, `settings/`, `product/`, `tracker/`, `check/`, `documents/`, `help/`.

---

## Top problems (summary)

1. **Too much explanatory text.** Almost every page opens with a 2–4 line paragraph, and many cards repeat their own (Rules: 17 helper paragraphs; Candidates: 16; Settings → Business: 9; Ads Review: 8). On a phone the intro fills the first screen (Watchlist, Suppliers).
2. **Very long pages with no pagination or sections.**
   - Brand detail is 19.7k px (29.8k on mobile, 273 rows);
   - Candidates is 14.7k;
   - N-grams is 11.2k (22.2k on mobile);
   - Niches 9.9k, Ads dashboard 8.3k, Niche Hunt 8.3k, Brands 8.0k, Settings → Gates 7.5k, Quotes 7.5k, PL Suppliers 7.1k.
3. **12 of 36 menu items use the generic "?" icon** (all six Stock items, four Ads items, two Private label items), identical to Help. A few more icons are reused for other meanings (Tag, Boxes, Gauge, Receipt, Building).
4. **The same data is shown on several pages.** The Alibaba supplier table appears three times. There are five pages that start a run, Favourites and Watchlist list the same products, Tracker and Stock Orders hold the same records, and there are three term tables in Ads.
5. **Tables are inconsistent.** There are five table implementations and three header styles (sentence case vs 11 px uppercase), the Stock Levels table has no panel, and only two pages paginate.
6. **Buttons are inconsistent.** There are 91 hand-rolled buttons, the secondary variant is never used, and destructive actions come in three looks. The primary action moves around (top right, under the intro, bottom of a card, per row; 141 filled "Create candidate" buttons on Niche Hunt), and a disabled primary looks like it's loading.
7. **Next steps are unclear.**
   - Runs has no "New run";
   - Suppliers has no "Add";
   - Private label Launch and Ads Launch open empty;
   - Ads Keywords `?asin=` shows one product in the picker and another's data;
   - Proposals' main button is disabled by default.
8. **Mobile is mostly sideways-scrolling tables.** Only the product column and one more are visible, two pages overflow the viewport (the Candidate sidebar at 450 px, the Bulk exports table at 965 px), breadcrumbs truncate ("Sup…"), and the 11 Settings tabs scroll sideways.
9. **Page frames are inconsistent.**
   - Some pages are narrow and centred, the rest full width.
   - Five page titles don't match their menu label: Qogita is "Pull from Qogita", Plan "Order plan", Keywords "Keyword bank", Review "Monthly review", Upload "Upload price lists".
   - Six pages have no breadcrumb: Home, Runs, Upload, Qogita, Settings and PL Suppliers.
10. **Visual language drifts.**
    - The verdict has four vocabularies (pass/warn/fail, SKIP/Buy/Wait, Order samples/check/drop, ok/out).
    - Five off-scale font sizes are hard-coded about 100 times.
    - The logo teal `#2F7F8C` differs from the UI accent `#0B8CA0`.
    - The extension has its own palette with two more teals.
