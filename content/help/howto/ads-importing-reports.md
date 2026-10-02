---
title: "Ads: importing reports"
summary: Import the Amazon Ads bulk export (or Sponsored Products CSV reports), and read the Ads dashboard's figures, placements, break-even ACoS and search-term chips.
synonyms: [ads import, bulk export, bulk file, bulk operations, xlsx, sponsored products, search term report, campaign report, campaign manager export, placements, keyword id, acos, break-even acos, csv, amazon ads]
workspace: ads
order: 1
---
Until the Amazon Ads API is connected, Ads works from files you export from Amazon Ads and import on **Ads → Imports**. The **bulk export** is the one to use: one file gives everything.

## The bulk export (recommended)

In Amazon Ads, go to **Campaign manager → Bulk operations**, pick a date range, tick **Sponsored Products** and **Include Sponsored Products search term data**, and download the .xlsx. One file gives:

| From the file | What the app keeps |
|---|---|
| **Campaign** rows | Settings (state, targeting, daily budget, bidding strategy, start date) and totals over the range |
| **Bidding adjustment** rows | Each placement (top of search, rest of search, product page, Amazon Business): its bid adjustment % and its own clicks, spend, orders and sales |
| **Ad group** rows | Default bid and state |
| **Product ad** rows | The SKU and ASIN each campaign advertises. A campaign whose product ads advertise one ASIN is linked to it automatically |
| **Keyword** rows | Keyword ID, text, match type, bid, state and performance |
| **Negative keyword** rows | Keyword ID, text and match type (negative exact or phrase) |
| **Product targeting** rows | An auto campaign's targeting groups, with bid and performance |
| **SP Search Term Report** sheet | Each customer search term with the keyword (or targeting) that matched it |

**Give the date range.** The bulk file doesn't record the range it was exported for, so the preview asks for it (it's filled in when the file name holds two dates). Enter the range you picked in Amazon Ads; the figures are kept as that range.

Keyword, ad group and campaign IDs are kept exactly, so [Proposals](/help/howto/ads-rules-and-proposals) can send changes back as a bulk sheet Amazon accepts: bids, states, budgets and placement percentages updated, keywords and negatives created, in the export's own column order.

## CSV reports

The CSV reports still work, for a quick look or a range you haven't bulk-exported. Three are read. Each file's format is worked out from its columns, in any order:

| Export | Where in Amazon Ads | What it gives |
|---|---|---|
| **Search term report** | Measurement & reporting → Sponsored Products → Search term | Each search term's impressions, clicks, spend, orders, sales and units, per campaign and ad group, over its date range |
| **Campaign report** | Measurement & reporting → Sponsored Products → Campaign | Each campaign's totals over the report's date range |
| **Campaign Manager export** | Campaign Manager → the grid → Export | Each campaign's settings (state, type, targeting, start date, budget) and totals |

The **daily Campaign report** (time unit Daily: one row per campaign per day) and the **Placement report** (daily or for a range) are read and kept: the Bid up, Budget and Revive rules need the daily one (see [Ads: rules and proposals](/help/howto/ads-rules-and-proposals)). Targeting (keyword) reports are recognised too. Daily rows are kept as days. A report with a date range is kept as that range. A range is never split into made-up days.

## Importing

1. Drop the bulk export (.xlsx) or CSV files on **Ads → Imports**, or click to choose. One drop zone takes either, several at once.
2. Each file shows what was read. A bulk export lists how many campaigns, placements, ad groups, product ads, keywords, negatives and search terms it holds, and each campaign with the ASIN its product ads advertise. A CSV shows its report type, rows, the dates it covers, its totals and first rows. A file the app doesn't know says why and isn't imported.
3. Click **Import**.

**Importing the same data again doesn't double it.** Each row has a key (keywords, ad groups and product ads by Amazon's ID; search terms by campaign, ad group, matching keyword, term and date range; campaign totals by campaign and date range), and a newer import replaces the older import's rows. An import whose rows have all been replaced leaves the list. **Undo** on an import removes the rows it brought in.

### How the files fit together

- **Overlapping ranges count once.** A campaign's dated ranges, and its search terms, are taken widest first; a range that overlaps one already taken is skipped. A bulk export for 10 Aug – 2 Oct and a search term report for 11 Aug – 13 Sep aren't added together. On the same dates, the bulk export's terms (which name the matching keyword) win.
- **Campaign IDs.** Reports and the bulk export give a campaign a numeric ID. The Campaign Manager export gives it a console ID ("A0…"). The app links the two by the campaign's exact name, so keep names unchanged between exports.
- **The Campaign Manager export has no date range.** Its totals cover whatever range was picked in the console. A campaign's figures come from, in order: daily rows; dated campaign-report ranges (an overlapping range is taken once, never added twice); the Campaign Manager export ("as exported"); its search terms summed.
- **Values.** The ="…" wrapper Amazon puts on IDs is stripped. Money is read without the £, and percentages as percentages. "Aug 23, 2026 - Sep 13, 2026" is read as a start and an end date, and the Campaign Manager's dates as day/month/year. "Total cost", not "(converted)", is used.

## Which product a campaign advertises

A bulk export links each campaign to the ASIN its product ads advertise. That wins over an ASIN in the campaign's name, but never over a different ASIN you set yourself. A campaign whose product ads advertise several ASINs isn't linked: the import says so, and you pick one. Without a bulk export, a campaign named with an ASIN ("AD_READY: B0H9ZKYYHZ") is linked to it. For any other campaign, set the ASIN in the **ASIN** column of the dashboard's campaign table. A campaign without one is listed under **Campaigns without a product** and doesn't count towards any product.

## The dashboard

The dashboard is product by product: each product is a section (click its arrow to fold it) with its title, ASIN and image (from Keepa for 1 token if the app doesn't have them), its stock and launch plan, its figures and "Price, costs and target", then its campaigns (each opens to its placements), keywords and search terms. With more than one product, **Product** at the top picks one (remembered; Proposals and N-grams use the same choice). **Campaigns without a product** at the bottom lets you find the product for each one (by ASIN or words of the title, across the app's products, Niche Hunt and Keepa's cache, free; or look the ASIN up on Keepa for 1 token), see its title and image, and assign it; or **Archive** a campaign you don't care about (old tests): it leaves the dashboard and the rules, and **Archived campaigns** lists it to bring back.

**Products**: one tile per ASIN, over all its campaigns. Spend, sales (orders and units), **ACoS**, **break-even ACoS**, profit after ads, cost per order, CPC, conversion (orders ÷ clicks), CTR (clicks ÷ impressions) and fees per unit. ACoS is green at or under the target, amber up to break-even, red past it.

**Break-even ACoS** = margin before ads ÷ price, where margin before ads = price − Amazon's fees − landed cost. Spend more than that per ad sale and each ad sale loses money. The fees come from the fee engine on the active rate card: referral by category, FBA by size and weight (with the low-price rate at £20 and under), storage, and returns, with VAT and the digital services fee. Under **Price, costs and target** you set:

- **Sale price**. Blank uses Keepa's Buy Box if the app has it, else the ads' average sale price (sales ÷ units).
- **Landed cost a unit**. Needed for break-even and profit; the tile says so until it's set.
- **FBA fee override**, **package weight and size** (or **Size and weight from Keepa**, 1 token).
- **Phase** (launch or steady) and **target ACoS** for each phase. Blank uses Settings → Ads (30%).

**Profit after ads** = sales − fees × units − landed cost × units − spend.

**Campaigns**: the same figures per campaign, with its state, budget, keyword and negative counts, where the figures came from (bulk export or campaign report, Campaign Manager export, search terms) and the dates covered. The arrow opens its **placements**: each placement's bid adjustment and its own clicks, spend, orders, ACoS and cost per order.

**Search terms**: each term per campaign over everything imported, with the keywords that matched it ("matched by …"; hover for each one's clicks, spend and orders), sorted by spend (or clicks, orders, ACoS), filtered by campaign or status. The chip reads:

| Chip | When |
|---|---|
| **Converting** | Orders, ACoS at or under the product's target |
| **Over target** | Orders, ACoS over the target |
| **Watch** | No order yet, under 15 clicks and under half the product's price spent |
| **Waste** | No order after 15 clicks, or after spending half the product's price |

The Negative rule's defaults are the same thresholds (15 clicks, or half the price, with no order): change them on [Ads → Rules](/help/howto/ads-rules-and-proposals).

## Private label's ad estimate

Each import updates **Settings → Ads → CPC** to the account's trailing CPC: spend ÷ clicks over the last 60 days of dated data, while **Follow the account's trailing CPC** is on. [Private label](/help/pages/private-label)'s Gate 6 uses it: ads per unit at launch = CPC ÷ the candidate's search conversion.
