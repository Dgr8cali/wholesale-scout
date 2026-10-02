---
title: "Ads: rules and proposals"
summary: The eight Ads rules, how proposals are raised, approved, skipped and snoozed, and how to export the approved changes as a bulk sheet and upload it in Amazon Ads.
synonyms: [ads rules, proposals, harvest, negative keywords, negative exact, negative phrase, bid down, bid up, pause keyword, placement adjustment, budget, revive, bulk sheet, bulk upload, bulk operations, approve, snooze]
workspace: ads
order: 2
---
**Ads → Rules** turns the data you've imported (see [Ads: importing reports](/help/howto/ads-importing-reports)) into proposed changes on **Ads → Proposals**. Nothing changes in Amazon Ads until you upload the bulk sheet yourself.

## The rules

Each product's **target ACoS** is its own (launch or steady, on the dashboard), else Settings → Ads (30%). Its **price** is the one the dashboard uses. Every threshold below is a default you can change on **Ads → Rules**.

1. **Harvest.** A search term with 2+ orders at or under the target ACoS, found by an auto, broad or phrase target, becomes an exact keyword in the product's Exact campaign (bid = the term's CPC × 1.1, capped at target ACoS × price × conversion), plus a negative exact where it was found. With no Exact campaign, it proposes creating one.
2. **Negative.** A search term with 15+ clicks and no order, or no order after spending half the price, becomes a negative exact in its campaign. A word in 3+ such terms and in none with an order becomes a campaign negative phrase, listed apart as **word-level**.
3. **Bid down.** A keyword or target with 10+ clicks and ACoS over 1.2 × the target gets the bid that would hit the target: target ACoS × price × its conversion rate, at least £0.10.
4. **Bid up.** A keyword under 0.7 × the target with 2+ orders, in a campaign under 50% impression share or out of budget, gets +15%, up to £1.50.
5. **Pause.** A keyword with 25+ clicks and no order is paused.
6. **Placement.** A placement with 10+ clicks whose ACoS is 25%+ better than its campaign's, and itself no more than 1.2 × the target, gets +20 points of bid adjustment (up to 100%); one 25%+ worse than its campaign gets −20 (down to 0), whatever the target.
7. **Budget.** A campaign out of budget on 3 of the last 7 days at or under the target gets +20% budget; over 1.5 × the target for 14 days, −25%.
8. **Revive.** An exact keyword with 3+ lifetime orders and no impressions in the last 14 days gets +10% bid.

**What the bulk export can't tell.** It has totals for one range: no impression share and no days. **Bid up** and **Budget** need a daily campaign report imported as well, and **Revive** needs a bulk export of just the last 14 days beside a longer one. Proposals lists what each rule couldn't check under **What the rules couldn't check**. Negative and Pause use the latest bulk export's range as the "last 60 days"; export about 60 days for them.

On **Ads → Rules**, each rule has its thresholds, an on/off switch and a mode. **Propose** (the default) waits for your approval. **Auto** applies automatically once the Amazon Ads API is connected; until then it proposes like Propose. **Dry run** shows how many proposals each rule would make now, per product, with the settings on screen, before you save.

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
