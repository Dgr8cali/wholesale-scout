---
title: "Ads: importing reports"
summary: Import Sponsored Products reports exported from Amazon Ads (search term, campaign, Campaign Manager export), and read the Ads dashboard's figures, break-even ACoS and search-term chips.
synonyms: [ads import, sponsored products, search term report, campaign report, campaign manager export, acos, break-even acos, csv, amazon ads]
workspace: ads
order: 1
---
Until the Amazon Ads API is connected, Ads works from reports you export from Amazon Ads and import on **Ads → Imports**.

## What to export

Three exports are read today. Each file's format is worked out from its columns, in any order:

| Export | Where in Amazon Ads | What it gives |
|---|---|---|
| **Search term report** | Measurement & reporting → Sponsored Products → Search term | Each search term's impressions, clicks, spend, orders, sales and units, per campaign and ad group, over its date range |
| **Campaign report** | Measurement & reporting → Sponsored Products → Campaign | Each campaign's totals over the report's date range |
| **Campaign Manager export** | Campaign Manager → the grid → Export | Each campaign's settings (state, type, targeting, start date, budget) and totals |

Placement, targeting (keyword) and daily campaign reports are recognised too. Daily rows are kept as days. A report with a date range is kept as that range. A range is never split into made-up days.

## Importing

1. Drop the CSV files on **Ads → Imports**, or click to choose. Several at once is fine.
2. Each file shows what was read: the report type, rows, campaigns, the dates it covers, its totals, and its first rows. A file that isn't a report the app knows says why and isn't imported.
3. Click **Import**.

**Importing the same data again doesn't double it.** Each row has a key (campaign, ad group, search term and date range; or campaign and date range), and a newer import replaces the older import's rows. An import whose rows have all been replaced leaves the list. **Undo** on an import removes the rows it brought in.

### How the files fit together

- **Campaign IDs.** Reports give a campaign a numeric ID. The Campaign Manager export gives it a console ID ("A0…"). The app links the two by the campaign's exact name, so keep names unchanged between exports.
- **The Campaign Manager export has no date range.** Its totals cover whatever range was picked in the console. A campaign's figures come from, in order: daily rows; dated campaign-report ranges (an overlapping range is taken once, never added twice); the Campaign Manager export ("as exported"); its search terms summed.
- **Values.** The ="…" wrapper Amazon puts on IDs is stripped. Money is read without the £, and percentages as percentages. "Aug 23, 2026 - Sep 13, 2026" is read as a start and an end date, and the Campaign Manager's dates as day/month/year. "Total cost", not "(converted)", is used.

## Which product a campaign advertises

A campaign named with an ASIN ("AD_READY: B0H9ZKYYHZ") is linked to it automatically. For any other campaign, set the ASIN in the **ASIN** column of the dashboard's campaign table. A campaign without one is listed under **Campaigns without a product** and doesn't count towards any product.

## The dashboard

**Products**: one tile per ASIN, over all its campaigns. Spend, sales (orders and units), **ACoS**, **break-even ACoS**, profit after ads, cost per order, CPC, conversion (orders ÷ clicks), CTR (clicks ÷ impressions) and fees per unit. ACoS is green at or under the target, amber up to break-even, red past it.

**Break-even ACoS** = margin before ads ÷ price, where margin before ads = price − Amazon's fees − landed cost. Spend more than that per ad sale and each ad sale loses money. The fees come from the fee engine on the active rate card: referral by category, FBA by size and weight (with the low-price rate at £20 and under), storage, and returns, with VAT and the digital services fee. Under **Price, costs and target** you set:

- **Sale price**. Blank uses Keepa's Buy Box if the app has it, else the ads' average sale price (sales ÷ units).
- **Landed cost a unit**. Needed for break-even and profit; the tile says so until it's set.
- **FBA fee override**, **package weight and size** (or **Size and weight from Keepa**, 1 token).
- **Phase** (launch or steady) and **target ACoS** for each phase. Blank uses Settings → Ads (30%).

**Profit after ads** = sales − fees × units − landed cost × units − spend.

**Campaigns**: the same figures per campaign, with where they came from (campaign report, Campaign Manager export, search terms) and the dates covered.

**Search terms**: each term per campaign over everything imported, sorted by spend (or clicks, orders, ACoS), filtered by campaign or status. The chip reads:

| Chip | When |
|---|---|
| **Converting** | Orders, ACoS at or under the product's target |
| **Over target** | Orders, ACoS over the target |
| **Watch** | No order yet, under 15 clicks and under half the product's price spent |
| **Waste** | No order after 15 clicks, or after spending half the product's price |

Phase 2's proposals (negatives and bid changes) will use exactly these thresholds.

## Private label's ad estimate

Each import updates **Settings → Ads → CPC** to the account's trailing CPC: spend ÷ clicks over the last 60 days of dated data, while **Follow the account's trailing CPC** is on. [Private label](/help/pages/private-label)'s Gate 6 uses it: ads per unit at launch = CPC ÷ the candidate's search conversion.
