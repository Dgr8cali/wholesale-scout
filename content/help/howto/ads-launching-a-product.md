---
title: "Ads: launching a product"
summary: Build a new product's four launch campaigns as one bulk Create sheet on Ads → Launch, with the 60-day plan the rules follow.
synonyms: [launch, launcher, new product, campaign structure, auto campaign, broad, exact, product targeting, launch plan, 60 days, bulk create]
workspace: ads
order: 4
---
**Ads → Launch** writes a new product's launch campaigns as one bulk sheet to upload in Amazon Ads, and saves a 60-day plan.

## What you enter

Start from an **Ads product** or a **private-label candidate**:

| Field | Filled from |
|---|---|
| ASIN and SKU | The product's product ads or FBA stock. A new listing (a 2-pack, say) has its own SKU: type it |
| Sale price | The product, or the candidate's sell price |
| Head terms | A candidate's Gate 5: its top 8 Opportunity Explorer search terms by volume |
| Competitor ASINs | A candidate's page-one list |
| Daily budget, all four | A candidate's Gate 7 launch advertising ÷ 60 (else £10) |
| Launch target ACoS | The product's launch target, else Settings → Ads |
| Starting bid | The higher of the launch target ACoS × price × the smoothed conversion (the product's conversion, else the account's, else 7%) and the account's CPC × 0.8 (Settings → Ads). Both figures show under the field, with the one used marked, and follow the price and target as you change them |

## The campaigns

| Campaign | Targets | Bid | Budget |
|---|---|---|---|
| **<ASIN> Auto – <date>** | Close match and substitutes on; loose match and complements off | × 1.0 | 30% |
| **<ASIN> Broad – <date>** | The head terms, broad | × 0.8 | 20% |
| **<ASIN> Exact – <date>** | The head terms, exact | × 1.0 | 40% |
| **<ASIN> PT – <date>** | The competitor ASINs (product targeting) | × 0.9 | 10% |

Each has one ad group with the product ad, "Dynamic bids – down only", and a top-of-search adjustment of 0% to start. With no head terms or no competitors, that campaign is left out and its share of the budget goes to the others. Amazon's minimum is £1 a day per campaign.

**Create launch sheet** saves it under [Proposals → Exports](/help/howto/ads-rules-and-proposals) as a Launch batch, to download and upload in Campaign manager → Bulk operations → Upload. New campaigns have no IDs yet, so the sheet links its rows by the campaign's and ad group's names, as Amazon's bulk format allows.

## The 60-day plan

Saved with the launch and shown on the product's dashboard tile:

- **Weeks 1–2: harvest only.** The rules propose harvests and negatives only; bid changes wait.
- **Week 3: first bid-downs.** Bid-down proposals start.
- **Week 5: lower the target.** Lower the launch target ACoS by 5 points (dashboard → the product's targets).
- **Week 8: steady state.** Switch the product's phase to steady.

Creating a launch puts the product in its **launch** phase. Import a bulk export once the campaigns have run a few days so the rules can work on them.
