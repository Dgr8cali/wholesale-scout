---
title: Getting started
summary: The whole flow from a supplier price list or a Qogita pull to a shortlist and an order, and what each page is for.
synonyms: [overview, quick start, workflow, how it works, first steps, tour]
order: 1
workspace: general
---
Wholesale Scout takes a supplier's price list, or products pulled from Qogita, and screens every line against Amazon UK: Amazon's own data (SP-API) and Keepa history, through a series of gates, then a score. What's left is a shortlist you can turn into an order.


## Workspaces

The app has four workspaces, each a group in the sidebar:

- **Wholesale**: resell existing listings. Runs, [New run](/help/pages/new-run) (Upload file, Check ASINs, Qogita, Hunt and Scan a seller, as tabs), Products, Suppliers and Shortlist (the starred products and the Watching list); under More: Sellers, Brands and Plan.
- **Private label**: launch your own product. The **Pipeline** (every candidate from research to selling), [Candidates](/help/pages/private-label) (each with its own page of tabs, the launch included), Niches (My niches and [Find niches](/help/concepts/niche-hunt)) and Suppliers & quotes.
- **Ads**: run and tune Sponsored Products. [Dashboard (with Import and the imports history), Proposals (To review and Exports), Launch and Search terms (Keywords, N-grams, All search terms)](/help/pages/ads); under More: Rules (with the Ad settings) and Review.
- **Stock**: track what you hold. Levels, Purchases (the old Tracker and Orders) and Reorder; under More: Movements, Sales and Import.

The sidebar lists every workspace as a labelled group: its main pages, then **More** (closed until you open it; the app remembers) with the rest. **Today** is at the top; **Settings** and **Help** are pinned at the bottom. **Search or jump to…** at the top (⌘K or Ctrl+K) finds any page, product, candidate or supplier. Collapse the sidebar to an icon rail with the button at the top left (or Ctrl/Cmd+B); on a phone it slides out from the menu button and closes once you pick a page. Browser tabs read "Candidates · Private label · Wholesale Scout".

## The flow in five steps

### 1. Bring in products

You have three ways in:

- **A supplier sheet.** On **New run → Upload file** ([Upload](/help/pages/upload)), drop one or more .xlsx or .csv price lists, map the columns (EAN and unit price are the only must-haves), check the rows and press **Screen N rows**. A layout you've mapped before is recognised next time.
- **A Qogita pull.** On **New run → Qogita** ([Qogita](/help/pages/qogita)), choose a category or brands, set price and delivery limits and press **Pull and screen**. The pull is saved by name so you can run it again or have it re-pulled every night.
- **One-off items.** On **New run → Check ASINs** ([Check ASINs](/help/pages/check)), paste ASINs, EANs or Amazon links, each with a landed cost if you have one. On Amazon itself, the [Chrome extension](/help/pages/extension) shows the same verdict on product and search pages (see [Set up the extension](/help/howto/set-up-the-extension)).

Every one of these becomes a **run**: one row per product, screened with the profile you chose. Profiles hold every threshold; the default one is **First order** (see [Profiles](/help/concepts/profiles)).

### 2. Let the run screen

Screening happens in the background, so you can close the page. Rows are matched to an ASIN, checked against Amazon (catalog, price, gating, fees), then Keepa where a gate needs its history. Keepa is paid for in tokens, and only one run spends them at a time (see [Keepa tokens](/help/concepts/keepa-tokens)). The run's page shows progress and time left.

### 3. Read the verdicts

Each row gets a verdict:

- **Buy**: cleared every gate.
- **Check**: cleared the gates that fail, but something needs a look (a gate set to warn, or brand approval needed).
- **Skip**: stopped at a gate. Later gates didn't run, and the **Why** column says what stopped it.

Exports and the API keep the stored values: pass, warn and fail.

Rows marked **Buy** or **Check** also get a **score** from 0 to 100, banded green, amber or grey (see [Score](/help/concepts/score)). The gates themselves are explained one by one under Gates, starting with [Price band](/help/gates/priceBand). If you disagree with a gate for one product, you can [waive it](/help/howto/waive-a-gate).

On the [run's page](/help/pages/runs) you filter the table (say, **Buy** and **Check** only, green band), sort by score or **Your profit / mo**, and click a row to open its details beside the table: its gates, fees and sellers.

### 4. Keep what's interesting

- **Add to Shortlist** (in a row's **⋯** menu) to keep a product. [Shortlist](/help/pages/favourites) lists them with their latest result from any run, and flags any not screened for over 7 days.
- **Watch** a row that nearly made it: pick what would make it a buy (a Buy Box price, a number of sellers, and so on). Shortlist → [Watching](/help/pages/watchlist) re-checks them every Sunday and tells you what now passes.
- Add a **note** to any product; adding one stars it.

### 5. Turn it into an order

- [Plan](/help/pages/plan) builds an order from the products that pass on your default profile: which to buy, how many, and from whom, within your budget, line cap, months to sell and each supplier's MOV. Pin or exclude products and change quantities; press **Export xlsx** for a spreadsheet.
- For Qogita rows that passed, **Add to Qogita cart** in the row's details (or **Add N to Qogita cart** on Plan) puts the chosen supplier's offer in your Qogita cart. **Cart** in the top bar shows it, one order per supplier, with progress to each MOV.
- Any run's rows can go out as a spreadsheet with **Export N products to xlsx**.

## What each page is for

| Page | Use it to |
| --- | --- |
| [Today](/help/pages/home) | Your next steps across every workspace, the key numbers, and Ask Scout. |
| [Runs](/help/pages/runs) | List every run; open one to work through its results. |
| [New run](/help/pages/new-run) | Start a run: [Upload file](/help/pages/upload) (supplier price lists), [Check ASINs](/help/pages/check) (a handful without a file), [Qogita](/help/pages/qogita), [Hunt](/help/pages/hunt) or Scan a seller, one tab each. |
| [Products](/help/pages/products) | Every product the app has screened, filtered like a run. |
| [Sellers](/help/pages/sellers) | Scan a competitor's storefront and see how its listings screen. |
| [Suppliers](/help/pages/suppliers) | Keep each supplier's terms and see how their products screen. |
| [Shortlist](/help/pages/favourites) | Products you've starred, with their latest result (Products), and those waiting on a condition, re-checked weekly ([Watching](/help/pages/watchlist)). |
| [Plan](/help/pages/plan) | Build an order within your budget. |
| [Brands](/help/pages/brands) | See which brands are worth applying to sell (see [Apply for brand approval](/help/howto/apply-for-brand-approval)). |
| [Settings](/help/pages/settings) | Edit profiles, rules, the rate card, waivers and saved filters. |
| [Help](/help/pages/help) | Search these articles. |

## Sorting

Every table sorts by any column: click its header. The first click puts numbers and dates highest or newest first, and text A–Z; click again to reverse. A small arrow marks the column a table is sorted by. Numbers sort as numbers ("≥ 201" sorts as 201, "£12.50" as 12.50), and blank cells always go last, whichever the direction. Each table remembers its sort in this browser, so it opens the way you left it.

## Terms worth knowing

The [glossary](/help/reference/glossary) explains the app's own words. The ones you'll meet first are [hurdle price](/help/reference/glossary#hurdle-price) (the sell price at which a product clears every profit floor), [max landed](/help/reference/glossary#max-landed) (the most it can cost you delivered to Amazon and still clear them), [your share](/help/reference/glossary#your-share) (the sales a month you can expect once you're one of the sellers) and [months to sell](/help/reference/glossary#months-to-sell).
