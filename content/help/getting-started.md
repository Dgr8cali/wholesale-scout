---
title: Getting started
summary: The whole flow from a supplier price list or a Qogita pull to a shortlist and an order, and what each page is for.
synonyms: [overview, quick start, workflow, how it works, first steps, tour]
order: 1
---
Wholesale Scout takes a supplier's price list, or products pulled from Qogita, and screens every line against Amazon UK: Amazon's own data (SP-API) and Keepa history, through a series of gates, then a score. What's left is a shortlist you can turn into an order.

## The flow in five steps

### 1. Bring in products

You have three ways in:

- **A supplier sheet.** On [Upload](/help/pages/upload), drop one or more .xlsx or .csv price lists, map the columns (EAN and unit price are the only must-haves), check the rows and press **Screen N rows**. A layout you've mapped before is recognised next time.
- **A Qogita pull.** On [Qogita](/help/pages/qogita), choose a category or brands, set price and delivery limits and press **Pull and screen**. The pull is saved by name so you can run it again or have it re-pulled every night.
- **One-off items.** On [Check ASINs](/help/pages/check), paste ASINs, EANs or Amazon links, each with a landed cost if you have one. On Amazon itself, the [Chrome extension](/help/pages/extension) shows the same verdict on product and search pages (see [Set up the extension](/help/howto/set-up-the-extension)).

Every one of these becomes a **run**: one row per product, screened with the profile you chose. Profiles hold every threshold; the default one is **Test order** (see [Profiles](/help/concepts/profiles)).

### 2. Let the run screen

Screening happens in the background, so you can close the page. Rows are matched to an ASIN, checked against Amazon (catalog, price, gating, fees), then Keepa where a gate needs its history. Keepa is paid for in tokens, and only one run spends them at a time (see [Keepa tokens](/help/concepts/keepa-tokens)). The run's page shows progress and time left.

### 3. Read the verdicts

Each row gets a verdict:

- **pass**: cleared every gate.
- **warn**: cleared the gates that fail, but something needs a look (a gate set to warn, or brand approval needed).
- **fail**: stopped at a gate. Later gates didn't run, and the **Why** column says what stopped it.

Rows that pass or warn also get a **score** from 0 to 100, banded green, amber or grey (see [Score](/help/concepts/score)). The gates themselves are explained one by one under Gates, starting with [Price band](/help/gates/priceBand). If you disagree with a gate for one product, you can [waive it](/help/howto/waive-a-gate).

On the [run's page](/help/pages/runs) you filter the table (say, pass and warn only, green band), sort by score or **Your profit / mo**, and open a row to see its gates, fees and sellers.

### 4. Keep what's interesting

- **Star** a row to make it a favourite. [Favourites](/help/pages/favourites) lists them with their latest result from any run, and flags any not screened for over 7 days.
- **Watch** a row that nearly made it: pick what would make it a buy (a Buy Box price, a number of sellers, and so on). The [Watchlist](/help/pages/watchlist) re-checks them every Sunday and tells you what now passes.
- Add a **note** to any product; adding one stars it.

### 5. Turn it into an order

- [Plan](/help/pages/plan) builds an order from the products that pass on your default profile: which to buy, how many, and from whom, within your budget, line cap, months to sell and each supplier's MOV. Pin or exclude products and change quantities; press **Export xlsx** for a spreadsheet.
- For Qogita rows that passed, **Add to Qogita cart** in the row's details (or **Add N to Qogita cart** on Plan) puts the chosen supplier's offer in your Qogita cart. **Cart** in the top bar shows it, one order per supplier, with progress to each MOV.
- Any run's rows can go out as a spreadsheet with **Export N products to xlsx**.

## What each page is for

| Page | Use it to |
| --- | --- |
| [Home](/help/pages/home) | See recent runs, Keepa spend, and what needs attention. |
| [Runs](/help/pages/runs) | List every run; open one to work through its results. |
| [Upload](/help/pages/upload) | Screen supplier price lists. |
| [Check ASINs](/help/pages/check) | Screen a handful of ASINs or EANs without a file. |
| [Sellers](/help/pages/sellers) | Scan a competitor's storefront and see how its listings screen. |
| [Suppliers](/help/pages/suppliers) | Keep each supplier's terms and see how their products screen. |
| [Qogita](/help/pages/qogita) | Pull products from Qogita and save pulls to re-run nightly. |
| [Favourites](/help/pages/favourites) | Products you've starred, with their latest result. |
| [Watchlist](/help/pages/watchlist) | Products waiting on a condition, re-checked weekly. |
| [Plan](/help/pages/plan) | Build an order within your budget. |
| [Brands](/help/pages/brands) | See which brands are worth applying to sell (see [Apply for brand approval](/help/howto/apply-for-brand-approval)). |
| [Settings](/help/pages/settings) | Edit profiles, rules, the rate card, waivers and saved filters. |
| [Help](/help/pages/help) | Search these articles. |

## Terms worth knowing

The [glossary](/help/reference/glossary) explains the app's own words. The ones you'll meet first are [hurdle price](/help/reference/glossary#hurdle-price) (the sell price at which a product clears every profit floor), [max landed](/help/reference/glossary#max-landed) (the most it can cost you delivered to Amazon and still clear them), [your share](/help/reference/glossary#your-share) (the sales a month you can expect once you're one of the sellers) and [months to sell](/help/reference/glossary#months-to-sell).
