---
title: Demand
summary: Checks that the product sells enough, that your share of those sales is worth having, and that your first order sells in time; the rank decides only when there's no sales figure.
synonyms: [sales, sales rank, bsr, rank drops, your share, months to sell, velocity, sell-through]
gate: demand
order: 8
---
Demand checks that the product sells, and sells enough for you once you share the sales with the other sellers. It also checks that your first order would sell through in a reasonable time.

## What it checks

When the product has a sales figure, these must hold (the rank is shown on the line but doesn't decide):

- **Sales a month (total)** at least **Min sales / month (total)**. Sales are the highest of three figures from Keepa: rank drops in 30 days counted from the history, Keepa's own 30-day rank-drop count, and Amazon's "bought in past month". This is the same figure as the **Sales / mo** column.
- **[Your share](/help/reference/glossary#your-share)** at least **Min your share**. Your share = sales ÷ (other FBA sellers + 1 for you). When Amazon is on the listing it counts as three sellers.
- **[Months to sell](/help/reference/glossary#months-to-sell)** the first order no more than **Max months to sell the order**. The first order is what one line's share of the budget buys at the landed cost (see [Budget fit](/help/gates/budgetFit)), raised to the MOQ if that's larger. Months to sell = that quantity ÷ your share. This part needs a cost, so an ASIN check with no cost skips it.

### When there's no sales figure

Only when none of the three sales figures is known (no rank drops counted from the history, no Keepa 30-day count, no "bought in past month") does the rank decide: the 90-day average rank (else the current rank) must be no worse than the product's category ceiling in **Max rank by category**, else **Max 90-day average rank**. Your share and months to sell can't be worked out without sales, so they aren't checked. The category is Keepa's top-level category (the one the rank is counted in); for Keepa data fetched before categories were kept, the catalog's.

A figure of 0 is a sales figure: 0 rank drops in 30 days fails on sales, whatever the rank.

### Dormant listings

A [dormant](/help/reference/glossary#dormant) listing has history but nobody selling now. It's judged on the past 12 months instead: rank drops over 12 months as a monthly rate and your share (the monthly rate, shared with nobody); the 12-month average rank is shown. Only when there are no rank drops to count does the 12-month average rank decide, against the same ceiling.

## When it runs

**After Keepa history.** A current rank alone says nothing about sales, so without history the gate is skipped rather than passed. If Keepa isn't set up, it's always skipped.

## Settings

Settings, **Gates** tab, card **8 Demand** (Needs: Keepa / SP-API).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **off**, **warn** or **fail**. |
| **Min sales / month (total)** | 30 | Lower it to accept slower sellers. |
| **Min your share (sales / month)** | 5 | Lower it to accept crowded listings where you'd sell fewer. |
| **Max 90-day average rank** | 50,000 | Used only for products with no sales figure (see above), and for any category not in the table below. Raise it to accept such products further down the rankings. |
| **Max rank by category** (no sales figure only) | Beauty 60,000; Health & Personal Care 60,000; Grocery 50,000; Automotive 150,000; DIY & Tools 150,000; Sports & Outdoors 150,000; Home & Kitchen 200,000 | A rank means different sales in different categories: tighter in Beauty, Grocery and Health, looser in the big categories. Change a value, remove a category (it then uses the max above), add one from the list, or **Reset to suggested**. Names are matched loosely ("Health & Household" counts as Health & Personal Care). Every shipped profile starts with this table. |
| **Max months to sell the order** | 3 | Raise it to accept slower sell-through of the first order. |

The first-order size depends on **Budget** (Profiles tab) and **Max first order per line** ([Budget fit](/help/gates/budgetFit)).

## Mode in each profile

| Profile | Mode | Min sales | Min your share | Max avg rank | Max months |
|---|---|---|---|---|---|
| First order (default) | fail | 10 | 8 | 100,000 | 3 |
| Strict | fail | 30 | 5 | 50,000 | 3 |
| Test order | fail | 30 | 5 | 50,000 | 3 |
| Dry goods only | fail | 30 | 5 | 50,000 | 3 |

First order asks for fewer sales (10 a month) but a bigger share for you (8 a month), and accepts a 90-day average rank up to 100,000. Its line cap is 25% of the budget and Test order's is 30%, so their first orders are smaller and sell through sooner than in Strict and Dry goods only, which allow 100%.

## Reading the why-line

When the product has a sales figure, the line ends with its rank, marked "(shown, not gated: sales decide)". When it has none, the line starts "no sales data" and says which ceiling applied: "over 60,000 for Beauty" or "(Beauty max 60,000)" for a category's own, "over 50,000" or "(max 50,000)" for the profile-wide one.

When it trips, each failed check is listed, joined with "; ".

| Status | Example | Meaning |
|---|---|---|
| fail / warn | 18 sales in 30 days, under 30; 90-day average rank 8,210 (shown, not gated: sales decide) | Too few sales in total; the rank is only for reference. |
| fail / warn | your share 3.8/mo, under 5 (30 sales ÷ 7 other sellers, Amazon counted as 3 + you) | 4 FBA sellers plus Amazon counted as 3, plus you: 30 ÷ 8. |
| fail / warn | 47 units at 6/mo = 7.8 months, over 3 | The first order takes too long to sell at your share. |
| fail / warn | 96 units (MOQ) at 12/mo = 8 months, over 3 | The MOQ is bigger than the line cap buys, so the order is the MOQ. |
| fail / warn | 43 units at 0/mo = never at your share, over 3 | No sales, so the order never sells. |
| fail / warn | no sales data: 90-day average rank 72,400, over 60,000 for Beauty | No sales figure, and the rank is past the category's ceiling. Reads "current rank …" when there's no 90-day average. |
| fail / warn | no sales data and no rank in the last 90 days | Nothing to judge on. |
| pass | no sales data: judged on rank, 90-day average rank 12,000 (Beauty max 60,000) | No sales figure; the rank is within the ceiling. |
| pass | 60 sales/mo, your share 15/mo; order 40 sells in 2.7 months; 90-day average rank 72,400 (shown, not gated: sales decide) | Sales and share are enough; a poor rank doesn't fail it. |
| fail / warn | dormant: no sales history (Keepa has no sales rank for it in 12 months) | Dormant with nothing to go on. Also "(no rank drops in 12 months)". Tagged DORMANT. |
| fail / warn | dormant: 120 rank drops in 12 months (10/mo), under 30/mo | Dormant, too slow. |
| pass | dormant: 480 rank drops in 12 months (40/mo); order 40 sells in 1 month; 12-month average rank 15,300 (shown, not gated: sales decide) | Dormant but sold well over the year. |
| pass / fail | dormant, no sales data: judged on rank, 12-month average 9,000 (DIY & Tools max 150,000) | Dormant with no rank drops to count: the 12-month rank against the ceiling. |
| skipped | Needs Keepa history to count sales (current rank 12,345) | No history yet. Or just "Needs Keepa history". |
| off | Gate off in this profile | |

## What to do about a fail

- **Too few sales** (or, with no sales figure, a poor rank): usually a real no. Check the rank history on Keepa for a seasonal dip.
- **Your share too low**: too many sellers. See [Competition shape](/help/gates/competition).
- **Months to sell too high**: a smaller first order helps. Lower **Max first order per line** or ask the supplier for a smaller MOQ.
- To change the thresholds, see [change a threshold](/help/howto/change-a-threshold). To accept this product, [waive the gate](/help/howto/waive-a-gate).
- On a single check that stopped before Keepa, **Fetch anyway** on the [Check](/help/pages/check) page fetches the history this gate needs.
