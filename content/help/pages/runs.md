---
title: Runs
summary: Every run you've screened, and a run's own page where you filter, sort, open and act on its results.
synonyms: [batch, screening job, results table, filter bar, columns, re-screen, pause, export, shortlist, keepa queue]
route: /runs
order: 2
---
A run is one screening job: an upload, a Qogita pull, an ASIN check, a seller scan or a re-screen of selected rows. The Runs page lists them all; a run's own page is where you read its results and act on them.

A row's verdict is shown as **Buy** (it passed every gate), **Check** (a gate warned) or **Skip** (it failed a gate), and **Error** when the row couldn't be processed; exports and the API keep pass, warn and fail.

## The runs list

Repeat uploads of the same file are grouped: the newest is shown, with the older ones folded under it.

### Top of the list

| Control | What it does |
| --- | --- |
| **Search runs, files or suppliers** | Filters the list by run name, file name or supplier. |
| **Show archived** | Shows archived runs instead of the current ones. |
| **⋯** (More actions) › **Import DG report…** | Saves each ASIN's status from Seller Central's Dangerous Goods lookup file on its products, without re-screening anything (see [Import a DG report](/help/howto/import-a-dg-report)). |
| **⋯** (More actions) › **Fetch missing images** | Fetches product images from Amazon's catalog (free) for products screened before images were kept, 400 at a time until none are left. |

### Columns

| Column | Shows |
| --- | --- |
| Checkbox | Selects the run for the bulk actions. The header box selects every run shown. |
| **Run** | The run's name (click to open; the pencil renames it in place), the file or source under it if the name differs, and badges: **archived**, and **stale** when its newest Keepa data is over 7 days old. An icon shows where the rows came from: uploaded file, pulled from Qogita, Qogita nightly re-pull, re-screen of favourites, re-screen of selected rows, ASIN check or seller scan. A link such as "×3: 2 earlier uploads" unfolds older uploads of the same file. |
| **Supplier** | The suppliers in the run. |
| **Started** | When it started. |
| **Rows** | How many rows it has. |
| **Results** | A bar of **Buy**, **Check** and **Skip** (plus errors and rows still to screen), with counts. |
| **Status** | **Done**, **Error**, **Paused** ("at N of M"), or **Screening** with a progress bar. A screening run also shows **Using Keepa** (it's the one spending Keepa tokens) or **Waiting for Keepa** (another run has Keepa; this one waits its turn). |

Click **Run**, **Started** or **Rows** to sort by it; click again to reverse. The list refreshes every 10 seconds while any run is still screening. On a phone the hidden columns are summarised under the name.

### A run's menu (⋯ on each row)

| Item | What it does |
| --- | --- |
| **Open** | Opens the run. |
| **Rename** | Asks for a new name. |
| **Re-screen** | Re-runs every gate and the score with the run's profile as saved now, from the data already fetched (see [Re-screen](#re-screen)). Only on finished runs. |
| **Pause** / **Resume** | Only while screening. Pause stops after the current batch; see [Pause and resume](#pause-and-resume). |
| **Go first on Keepa** | Only when the run is queued for Keepa behind another. Puts it first in line. |
| **Refresh Keepa data** | Only on a **stale** run. Sends rows whose Keepa history is over 7 days old back for a fresh fetch, which spends tokens. Says "Refreshing Keepa data for N rows", or "Nothing older than 7 days to refresh". |
| **Export to xlsx** | Downloads every row as a spreadsheet (see [Export](#export)). |
| **Export ASINs for DG lookup** | Downloads the run's ASINs as a one-column CSV for Seller Central's Dangerous Goods lookup (see [Import a DG report](/help/howto/import-a-dg-report)). |
| **Import DG report…** | Pick the file the Dangerous Goods lookup returned: each ASIN's status is saved on its product and this run is re-screened. Only for finished runs. |
| **Archive** / **Restore** | Hides the run from the list (or brings it back). Nothing is deleted. |
| **Delete…** | Deletes the run and its results after you confirm. Products, favourites and waivers are kept. It can't be undone. |

### Bulk actions

Tick one or more runs and a bar appears: **Archive**, **Delete…** (with the same confirmation) and **Clear**.

## A run's page

### Header

The name at the top can be edited in place (click it). Under it: the source, then the profile and which version of it the rows reflect, for example "First order (version saved 25 Sept, 12:31; applied 25 Sept, 13:05)", when it started, how many products and listings, and Keepa tokens spent, split by stage ("history 412 · Buy Box 36 · sellers 9"). A seller scan also names the storefront, how many of its ASINs were screened, and how many it holds the Buy Box on now.

| Control | What it does |
| --- | --- |
| Profile picker | Chooses the profile for **Re-screen**. The first option is the run's own profile "(as saved now)"; the others are your other profiles. |
| **Re-screen** | See [Re-screen](#re-screen). Disabled while the run is screening. |
| **Pause** / **Resume** | Shown while screening. |
| **Export N products to xlsx** | Downloads the rows the filters show. |
| **Delete** | Deletes this run after you confirm, and returns you to Runs. |

### Progress and time left

While a run screens, a panel shows "Screening N of M" (or "Re-screening: N of M rows", or "Paused at N of M") with a bar, and a time-left line such as "About 12 min left", "Under a minute", "Estimating time left…" or "Waiting for Keepa tokens, resumes at 14:32". Time left comes from how fast this run has been getting through Amazon and from Keepa's balance and refill rate.

Under it:

- **N waiting on Amazon (catalog, price, gating, fees)**
- **N waiting on Keepa tokens**, with "resumes about 14:32" when it's waiting for a refill
- **N Keepa tokens so far**

It says "Working in the background: you can close this page." Closing the page doesn't stop screening; if the work stalls, opening the page picks it up again.

Only one run spends Keepa tokens at a time. If another run has Keepa, you'll see "Keepa is in use by [that run]; this run waits its turn (one run uses Keepa at a time)." with a **Go first** button that puts this run first in line. When it's this run's turn: "This run is the one using Keepa now." See [Keepa tokens](/help/concepts/keepa-tokens).

### Pause and resume

**Pause** stops the run after the batch in hand. Everything done so far is kept, and nothing runs and no Keepa tokens are spent until you press **Resume** (also offered as a **resume** link in the progress panel). Resume carries on where it stopped. Use it to free Keepa for another run, or to stop spending while you change a profile.

### Re-screen

**Re-screen** re-runs every gate and the score with the chosen profile as it's saved now, using the data already fetched: no re-upload, and no new Amazon or Keepa calls except for rows that now need data they never fetched (those are looked up, which can spend Keepa tokens). Use it after you change a threshold in [Settings](/help/pages/settings) (see [Change a threshold](/help/howto/change-a-threshold)). You'll see "Re-screening with First order as saved now: N rows done", with how many carry on in the background. Rows that never fetched data a gate now needs (for example they failed early, before Keepa) go back in the queue to fetch just that, and the message says how many.

### The ASIN check card

A run made by [Check ASINs](/help/pages/check) (or Re-check) for a single item shows a verdict card above the table:

- The verdict (**Buy**, **Check**, **Skip**, or **Screening** while it's working; **updating** while more data arrives), the score, and **no Keepa history** when there's none.
- Title, ASIN, EAN, a link to Amazon, and "Checked 2 h ago · **Re-check**". Re-check checks the same ASIN (and cost) again as a new check.
- **Apply to sell** when Amazon gives an application link (see [Apply for brand approval](/help/howto/apply-for-brand-approval)).
- Eight figures: **Profit at £X** (with ROI and margin), or **Profit** "no cost given"; **Hurdle** (the [hurdle price](/help/reference/glossary#hurdle-price)) or, with no cost, **Max landed** ("clears the floors at or under", see [max landed](/help/reference/glossary#max-landed)); **Sells at**; **Sales / mo** with the seller count; **Your share** per month; **Months to sell** with the first order quantity; **Amazon** (selling now, not now with when it was last seen, or never); **Gating** (Open, Approval needed, Blocked or Unknown) with the fees.
- The why-line.

When the item failed a gate before Keepa was asked, the card says "Stopped at **Price band** before Keepa: Buy Box, offers and Amazon are from Amazon's current offers (free); sales, your share and history weren't fetched." Those figures say "not fetched: failed at price band". **Fetch anyway** screens it again gathering every source (Amazon, Keepa, gating, fees) past the failing gate, which spends Keepa tokens. The verdict is still decided by the gates, so it stays **Skip**; you just get the full picture.

### Filters

The same filter bar sits above the results on a run, [Shortlist → Products](/help/pages/favourites), a [brand's page](/help/pages/brands) and [Products](/help/pages/products). On a run it works on products (one per EAN). Every active filter must match.

The filters live in the page's address (for example `?verdict=buy,check&profit=3&bsr=..50000&gated=no`), so a filtered view can be bookmarked, shared or opened from Today and ⌘K, and the browser's Back button undoes a change.

| Filter | What it keeps |
| --- | --- |
| **ASIN, EAN, title or brand** | Text search across those (and the supplier and why-line on a run). |
| **Buy**, **Check**, **Skip**, **Not scored** | Rows with that verdict, each with its count; tick several to keep any of them. **Not scored** is a row with no verdict yet. |
| **Profit ≥**, **ROI ≥**, **Sales/mo ≥**, **BSR ≤** | Profit per unit at least £X, ROI at least X%, estimated sales a month at least X, and a Best Sellers Rank of X or better. A row with no value drops out once one is set. |
| **Gated** (**Any**, **Yes**, **No**) | Yes: approval needed or blocked; No: open to sell (a brand you're approved for counts as open). See [Gating](/help/gates/gating). |
| **Any supplier** | Rows from one supplier. |
| **More filters** | **Error** (only when rows errored) and **Dormant** ([dormant](/help/reference/glossary#dormant) listings, whatever their verdict); the **green**, **amber** and **grey** score bands (see [Score](/help/concepts/score)); **On Shortlist** (starred products; shown once you have some); **Waived**; **Amazon on listing** per the [Amazon presence](/help/gates/amazonPresence) gate; **Open**, **Approval needed**, **Blocked**; **Failed gate** with counts; **Brand** (searchable); minimum and maximum **Ranges** for Offers, Margin, Sell price, Profit, ROI, Sales / mo and BSR; and **Saved filters**: **Save current filters…** saves what's on now by name, for every results page, and the bin deletes a set. |

Under the bar: "Showing N of M products (L listings shown)", a chip for each active filter (click one to remove it), and **Clear all**. On a phone everything but the search and the verdict chips folds behind **Filters**. The filters are in the address, and each run remembers its last ones in your browser: open the run again without filters in the address and they're put back (a link with filters wins; **Clear all** forgets them).

### The results table

One line per EAN. Where an EAN matched several ASINs, the best one leads and "▸ N other ASINs for this EAN" unfolds the others (marked ↳). The table starts sorted by **Score**, highest first; click any header with a sort to sort by it, again to reverse. Empty values sort last. A long run scrolls inside its card (only the rows in view are drawn, so it stays quick); the header row, the checkbox and the product stay in view as you scroll down or sideways.

The columns shown at first, on every results page:

| Column | Shows |
| --- | --- |
| Checkbox | Selects the row. The coloured edge is the verdict. The header box selects every row the filters match, collapsed alternatives included. |
| **Product** | Image, title (★ when it's on your Shortlist), ASIN (links to Amazon), EAN, supplier ("(+2)" when other suppliers offer it). On a seller scan: **Holds Buy Box** or "Buy Box: another seller". |
| **Verdict** | **Buy**, **Check**, **Skip**, **Not scored** or **Error**, with **Dormant**, **Waived** or **Cost overridden** under it. Hover over **Cost overridden** to see your cost and the sheet's original. |
| **Buy price** | The supplier's unit cost, ex-VAT in GBP ("—" when no cost was given). |
| **Sell price** | The price it's scored at. |
| **Profit** | Profit per unit; red when negative. |
| **ROI** | Return on landed cost. |
| **Sales / mo** | Estimated sales a month. Hover for the source. |
| **BSR** | Best Sellers Rank now. |
| **Offers** | FBA sellers from Keepa, else all new offers from Amazon. |
| **Gated** | **Open**, **Approval** or **Blocked** for your account. |
| **⋯** | The row's menu: **Add to Shortlist** (or **Remove from Shortlist**), **Re-screen** (this one row as a new run), **Product page**, **Open on Amazon** and **Copy ASIN**. |

More in **Columns**: **Score** (0–100 in its band colour), **Landed** (your landed cost; with no cost given, "≤ £X", the most it can cost landed), **Max landed**, **Margin**, **Your share / mo** (Sales / mo ÷ (FBA sellers + you), Amazon counted as 3; see [your share](/help/reference/glossary#your-share)), **Your profit / mo**, **Order qty** (the line cap ÷ landed cost, or the MOQ if that's more, flagged **MOQ**; on First order the line cap is £1,000 × 25% = £250), **Months to sell** (red when over the profile's limit; see [months to sell](/help/reference/glossary#months-to-sell)), **Buy Box**, **Rank 90 d** and **Buy Box 90 d** (small charts from the stored Keepa data), **Hurdle**, **Supplier**, **Screened** and **Why**.

Above the table, "Profit, ROI and margin" names the VAT basis they're on (**mixed** when rows differ: Settings → Business → Recalculate all). **Columns**, on the right, is remembered for each results page in your browser: tick to show or hide a column, arrows to move it, **Comfortable** / **Compact** for row height, **Reset** for the default set. Drag a header to move a column; drag its right edge to resize it (double-click the edge to reset its width).

On a phone each row is a card: image, title, verdict, profit, ROI and sales a month, its **⋯** menu and **Details**, 10 to a page, with **Previous**, **Next** and a page picker under them.

### A row's details

**Click a row** (on a phone, **Details**) to open it in a panel on the right. It shows the image, title, verdict, score, Sell, Profit, ROI and Margin, 90-day charts, the why-line, then the full details. **↑** / **↓** (or K / J) step through the rows shown, **Esc** closes it. The details hold:

- "Checked 2 h ago · **Re-check**": when the verdict was reached. Re-check checks the same ASIN, with the same landed cost, as a new [check](/help/pages/check).
- **Gates**: each gate's result (**Pass**, **Check** or **Fail**) and detail. A failed or warning gate has **Waive**: type a reason (optional) and press **Waive** (or Enter). The waiver applies to this product in every run: a fail becomes a warning and later gates run; a warning stops counting, so the row can go green. The product is re-screened now, fetching what later gates need. A waived gate has **Un-waive**. See [Waive a gate](/help/howto/waive-a-gate) and [waiver](/help/reference/glossary#waiver). "Stopped at Price band; later gates didn't run." marks where it stopped. A failed catalog lookup shows what was tried.
- **Days without a seller** and, for a dormant listing, when it last had a Buy Box. **Amazon:** selling now, when it was last seen, or never.
- **Per unit at £X**: referral, FBA, storage, returns allowance, output VAT, landed cost and profit, with where the fees came from. **Fees by source** compares Amazon's estimate, Keepa and the rate card (see [Fees](/help/concepts/fees)).
- **Source**: the supplier (links to its page), the quoted cost, GBP ex-VAT cost, MOQ, and a warning when the listing's pack differs from the supplier's (see [multipack](/help/reference/glossary#multipack)).
- **Set your cost**: your own landed cost, or a supplier price and its VAT basis, with a supplier name and note. It competes with the sheet's price in every run and the cheaper is scored; the product is re-scored now in every current run. With one set: **cost overridden** (or a note that the sheet's is cheaper), **Edit** and **Clear**. See [Override a cost](/help/howto/override-a-cost).
- **Score groups**: Demand, Competition, Price health, Margin, Risk and Fit, each 0–100.
- **Favourite note**: saved as you type. On a product not yet starred, adding a note stars it.
- **Watchlist**: pick a condition (or **Re-check weekly**), fill in its value, tick **No supplier yet** if you don't have one, then **Watch** (or **Save** to change it). A condition is suggested from what blocked it. See [Watchlist](/help/pages/watchlist).
- **From the extension**: Seller Central DG status and competitors' stock the [extension](/help/pages/extension) read, each with when it was read; stock over 7 days old is marked stale.
- **Top Buy Box sellers (365 days)**: each seller's Buy Box share, rating, storefront size and share of this brand, with **Scan this seller**.
- For Qogita rows: **Qogita offers**, every supplier's price per piece, ≈ GBP, MOV, tiers, case size, stock and delivery, with the one chosen marked "fits the budget". The chosen offer is the cheapest whose MOV fits your budget and that holds at least a case.

### Qogita cart

On a Qogita row whose verdict is **Buy** or **Check**, the details end with **Quantity** (in cases where the supplier sells by the case) and **Add to Qogita cart**. The quantity starts at the most your line budget buys, in whole cases and no more than the supplier holds. "Order whole cases of 6." appears if you type a number that isn't. **Cart** in the top bar opens the cart: one order per supplier with progress to its MOV, where you can change quantities, remove lines, **Refresh**, and **Check out on Qogita**.

### Shortlist, note and watch

**Add to Shortlist** in a row's **⋯** menu adds the product (EAN and ASIN) to the [Shortlist](/help/pages/favourites), which works across runs; a ★ marks it in the table. Removing a product with a note asks first, because the note is deleted with it.

### Bulk actions on selected rows

Tick rows and a bar appears:

| Control | What it does |
| --- | --- |
| **Add to Shortlist** / **Remove from Shortlist** | Stars or un-stars every selected product. |
| Gate picker, **Reason for all (optional)**, **Waive** / **Un-waive** | Waives (or un-waives) the chosen gate for every selected product, re-screening them. |
| **Set cost…** / **Clear cost** | Sets one cost override for every selected product (re-scoring them now), or clears it. See [Override a cost](/help/howto/override-a-cost). |
| **Re-screen selected** | Makes a new run of just these rows ("… — N selected"), with this run's profile, and opens it. |
| **Export selected (xlsx)** | Downloads just these rows. |
| **Remove from run** | Takes the rows out of this run after you confirm. Products and favourites are kept. |
| **Clear selection** | Unticks everything. |

Changing a filter clears the selection; "Selection of N cleared because the filters changed." offers **Reselect N**.

### Export

Exports are .xlsx files named after the run, one line per listing:

- **Export N products to xlsx** on a run's page exports what the filters show.
- **Export selected (xlsx)** exports the ticked rows, even ones the current filters hide. It's on Shortlist, a brand's page and Products too, in the same format.
- **Export to xlsx** on the runs list exports every screened row of the run, whatever filters you have on it.

The **Listing** column says "only" for an EAN with one ASIN, or "best" and "alternative" where it matched several. Other columns: Verdict (pass, warn or fail, the stored values), Score, Band, Product, Brand, EAN, ASIN, Supplier, the cost per unit quoted and in GBP ex-VAT, Est. sales / month and its source, Sellers and their source, Your share / mo, Your profit / mo, Order qty, Months to sell, Buy Box, Landed cost, Sell price and its source, Amazon fees and their source, Profit, ROI %, Margin %, Hurdle price, Failed gate, Why, MOQ, Offers seen and Source.

### Stale data

The **stale** badge and **Refresh Keepa data** are on the runs list, not on a run's page. A run is stale when its newest Keepa data is over 7 days old. To refresh one product rather than a run, use **Re-check** in its details.
