---
title: Ads
summary: The Ads workspace for Sponsored Products: a dashboard, bulk export and report imports, rules, and proposals to approve and export as a bulk sheet.
synonyms: [ads, sponsored products, ppc, acos, advertising, campaigns, bids, negative keywords]
route: /ads
order: 20
---
**Ads** is the third workspace, next to Wholesale and Private label, for running and tuning Sponsored Products. **Dashboard** and **Imports** work today, from the bulk export (or CSV reports) you download from Amazon Ads: see [Ads: importing reports](/help/howto/ads-importing-reports). **Rules** and **Proposals** turn that data into changes you approve and upload as a bulk sheet: see [Ads: rules and proposals](/help/howto/ads-rules-and-proposals). Once Amazon Ads API access is approved, approved changes can be applied directly.

## The pages

| Page | What it does |
|---|---|
| **Dashboard** | Per product: spend, sales, ACoS beside break-even ACoS, profit after ads, cost per order, CPC, conversion, CTR. The same per campaign. Search terms with a status chip (Converting, Over target, Watch, Waste). |
| **Imports** | Drop the bulk export (.xlsx): campaigns, placements, keywords with IDs, negatives, product ads and search terms with the keyword that matched, in one file. CSV reports (search term, campaign, Campaign Manager export) work too. Each file is previewed before you import. Re-importing doesn't double anything. |
| **Rules** | Thirteen rules (harvest, negatives, bids, pause, placements, budgets, revive, n-grams, stock guard, organic rank): thresholds, on/off, mode, and a dry run showing what each would propose now. |
| **Proposals** | The changes your rules suggest, grouped by product and rule, with the reason in real numbers and a confidence. Approve, skip or snooze; export the approved ones as a bulk sheet to upload in Amazon Ads. Nothing changes in Amazon Ads without your upload. |
| **N-grams** | Every search term's words and word pairs, with spend, orders, ACoS and waste per product; Rules 9 and 10 act on them. |
| **Launch** | A new product's four launch campaigns as one bulk Create sheet, and its 60-day plan. See [Ads: launching a product](/help/howto/ads-launching-a-product). |
| **Keywords** | The keyword bank: every term for a product, from Opportunity Explorer, harvests, n-gram winners, rank checks and you, with Add as exact, Add as negative and Track rank. See [Ads: keyword bank](/help/howto/ads-keyword-bank). |
| **Review** | The monthly AI review: per product and account-wide, whether last month's batches worked, and three ranked recommendations. See [Ads: AI review](/help/howto/ads-ai-review). |

## Target ACoS and break-even

**Settings → Ads** holds the default target ACoS, 30%. Each product can have its own, for launch and steady state, on the dashboard. **Break-even ACoS** is a product's margin before ads ÷ its price: spend more than that per ad sale and each ad sale loses money. Keep the target below it.

On Home, the Ads row shows the spend, the overall ACoS, and how many search terms are wasting spend.
