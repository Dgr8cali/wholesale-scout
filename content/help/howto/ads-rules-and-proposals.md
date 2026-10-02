---
title: "Ads: rules and proposals"
summary: The thirteen Ads rules, how proposals are raised, approved, skipped and snoozed, and how to export the approved changes as a bulk sheet and upload it in Amazon Ads.
synonyms: [ads rules, proposals, n-gram, ngram, stock guard, days of cover, inventory, organic rank, revert, rollback, snapshot, restore, harvest, negative keywords, negative exact, negative phrase, bid down, bid up, pause keyword, placement adjustment, budget, revive, bulk sheet, bulk upload, bulk operations, approve, snooze]
workspace: ads
order: 2
---
**Ads → Rules** turns the data you've imported (see [Ads: importing reports](/help/howto/ads-importing-reports)) into proposed changes on **Ads → Proposals**. Nothing changes in Amazon Ads until you upload the bulk sheet yourself.

## The rules

Each product's **target ACoS** is its own (launch or steady, on the dashboard), else Settings → Ads (30%). Its **price** is the one the dashboard uses. Every threshold below is a default you can change on **Ads → Rules**.

1. **Harvest.** A search term with 2+ orders at or under the target ACoS, found by an auto, broad or phrase target, becomes an exact keyword in the product's Exact campaign (bid = the term's CPC × 1.1, capped at target ACoS × price × conversion), plus a negative exact where it was found. With no Exact campaign, it proposes creating one.
2. **Negative.** A search term with 15+ clicks and no order, or no order after spending half the price, becomes a negative exact in its campaign. (Words that waste money across several terms are Rule 9's.)
3. **Bid down.** A keyword or target with 10+ clicks and ACoS over 1.2 × the target gets the bid that would hit the target: target ACoS × price × its conversion rate, at least £0.10.
4. **Bid up.** A keyword under 0.7 × the target with 2+ orders, in a campaign under 50% impression share or out of budget, gets +15%, up to £1.50.
5. **Pause.** A keyword with 25+ clicks and no order is paused.
6. **Placement.** A placement with 10+ clicks whose ACoS is 25%+ better than its campaign's, and itself no more than 1.2 × the target, gets +20 points of bid adjustment (up to 100%); one 25%+ worse than its campaign gets −20 (down to 0), whatever the target.
7. **Budget.** A campaign out of budget on 3 of the last 7 days at or under the target gets +20% budget; over 1.5 × the target for 14 days, −25%.
8. **Revive.** An exact keyword with 3+ lifetime orders and no impressions in the last 14 days gets +10% bid.
9. **N-gram negative.** A word or word pair with 20+ clicks (or the product's price spent) and no order, in 3+ distinct search terms and in none with an order, becomes a negative phrase in every ad group where it has served for that product. See [N-grams](#n-grams).
10. **N-gram winner.** A word or word pair with 5+ orders at or under the target across 3+ terms puts its top 5 terms forward for harvest (as Rule 1 would), even when each term alone is under the harvest threshold.
11. **Stock guard.** Under 10 days of FBA cover, the product's campaigns get budget −50% and bids −30%; under 3 days they're paused; back over 21 days, the values from before the guard are restored. See [Stock guard](#stock-guard).
12. **Ranked — ease off.** A keyword whose organic position was 8 or better on the last 3 rank checks gets bid −20%: the ad pays for a slot the listing already holds. See [Ads: rank checks](/help/howto/ads-rank-checks).
13. **Slipping.** A keyword whose organic position fell 10+ places between the last two rank checks, while its ads sell under the target ACoS, gets bid +10%.

When two rules want to change the same keyword's bid, one wins: pause, then bid down, ranked, slipping, bid up, revive. A campaign under the stock guard gets only the guard's changes (and negatives and harvests) until stock recovers. During a product's [launch](/help/howto/ads-launching-a-product) weeks 1–2, only harvests and negatives are proposed.

**What the bulk export can't tell.** It has totals for one range: no impression share and no days. **Bid up** and **Budget** need a daily campaign report imported as well, and **Revive** needs a bulk export of just the last 14 days beside a longer one. Proposals lists what each rule couldn't check under **What the rules couldn't check**. Negative and Pause use the latest bulk export's range as the "last 60 days"; export about 60 days for them.

On **Ads → Rules**, each rule has its thresholds, an on/off switch and a mode. **Propose** (the default) waits for your approval. **Auto** applies automatically once the Amazon Ads API is connected; until then it proposes like Propose. **Dry run** shows how many proposals each rule would make now, per product, with the settings on screen, before you save.

## N-grams

**Ads → N-grams** splits every search term into single words and adjacent word pairs, leaving out words like "for", "with" and "the" but keeping numbers ("7 day", "3 times"). It sums the terms' impressions, clicks, spend, orders and sales per product and gram, with the ACoS, the number of distinct terms it appears in (and how many of them have an order) and the **waste**: spend in terms with no order. Sort by spend or waste. A gram Rule 9 or 10 acts on is marked. Proposals shows the grams wasting most in a card at the top.

## Stock guard

The app reads FBA stock from Amazon (SP-API, getInventorySummaries) with the nightly orders sync, and on demand with **Fetch stock** on the dashboard. **Days of cover** = fulfillable units ÷ units sold a day over the last 14 days. Units come from Amazon's orders when the nightly sync has run in the last two days (all orders, ad or not); otherwise from the ads' own units over the imported range, and the tile says so. The product tile shows it in colour: red under 3 days, amber under 10, plain to 21, green above.

When a guard batch is exported, the budgets, bids and states it changes are saved. After you mark it uploaded and stock is back over 21 days, the guard proposes putting exactly those values back.

## Proposals

Each proposal shows the entity (keyword, target, search term, placement or campaign) and its campaign, the current and proposed value, the reason with the real numbers ("23 clicks, 0 orders, £12.76 spent = 142% of the £8.99 price"), the expected effect where it can be estimated, and a confidence:

| Confidence | When |
|---|---|
| **High** | 30+ clicks, or 3+ orders |
| **Medium** | 10–29 clicks |
| **Low** | Under 10 clicks |

They're grouped by product, then rule, and filtered by rule, confidence or campaign. The rules run again after every import and whenever you open Proposals, so the numbers are current. A rule raises at most one open proposal per entity.

- **Approve**: queued for the next bulk sheet. **Approve all high-confidence** approves every high-confidence proposal shown.
- **Skip**: not raised again for 30 days.
- **Snooze 14d**: not raised again for 14 days.

## Exporting and uploading the bulk sheet

1. On **Proposals**, click **Export bulk sheet**. The approved proposals become a batch (named by date, e.g. "2026-10-02 #1"), and its .xlsx downloads. The sheet has Amazon's own columns in the bulk export's order: **Update** rows for bids, states, budgets and placement percentages, and **Create** rows for new keywords, negatives and campaigns.
2. In Amazon Ads, go to **Campaign manager → Bulk operations**, choose **Upload**, and pick the file. Amazon checks it and lists any row it rejects.
3. Back on **Proposals → Exports**, click **Mark batch as uploaded**. Its changes won't be proposed again for 30 days, which gives the next export time to show their effect.

**Exports** lists every batch with its change list, the file to download again, and when it was uploaded. Import a fresh bulk export after the changes have run for a while, and the rules work from the new figures.

## Reverting a batch, and snapshots

Before any batch is written, the current value of everything it changes (bid, state, budget, placement percentage) is saved with it. **Revert this batch** writes the inverse sheet as a new batch, linked to the original: Update rows putting the saved values back. A bulk file can't delete, so keywords and campaigns the batch created are paused and negatives it created are archived (a negative can't be paused). Those are found by their text in the latest import; until a bulk export made after the upload has been imported, they can't be found, and the revert batch's notes list them.

**Snapshot now** (on Exports) saves every keyword's bid and state, every budget, ad-group bid, target and placement percentage as last imported, with a label. **Restore snapshot** compares it with the latest import and writes the sheet back to it: values that differ are put back, and keywords, targets and campaigns added since are paused. The last 20 snapshots are kept. Both compare against the data last imported, so import a fresh bulk export first if you've uploaded changes since.
