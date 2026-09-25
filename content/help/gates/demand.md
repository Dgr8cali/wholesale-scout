---
title: Demand
summary: Checks that the product sells enough, that your share of those sales is worth having, and that your first order sells in time.
synonyms: [sales, sales rank, bsr, rank drops, your share, months to sell, velocity, sell-through]
gate: demand
order: 8
---
Demand checks that the product sells, and sells enough for you once you share the sales with the other sellers. It also checks that your first order would sell through in a reasonable time.

## What it checks

All of these must hold:

- **Sales a month (total)** at least **Min sales / month (total)**. Sales are the highest of three figures from Keepa: rank drops in 30 days counted from the history, Keepa's own 30-day rank-drop count, and Amazon's "bought in past month". This is the same figure as the **Sales / mo** column.
- **[Your share](/help/reference/glossary#your-share)** at least **Min your share**. Your share = sales ÷ (other FBA sellers + 1 for you). When Amazon is on the listing it counts as three sellers.
- **Average rank** no worse than the product's category ceiling in **Max rank by category**, else **Max 90-day average rank**. The category is Keepa's top-level category (the one the rank is counted in); for Keepa data fetched before categories were kept, the catalog's category. Without a 90-day average, the current rank is used.
- **[Months to sell](/help/reference/glossary#months-to-sell)** the first order no more than **Max months to sell the order**. The first order is what one line's share of the budget buys at the landed cost (see [Budget fit](/help/gates/budgetFit)), raised to the MOQ if that's larger. Months to sell = that quantity ÷ your share. This part needs a cost, so an ASIN check with no cost skips it.

### Dormant listings

A [dormant](/help/reference/glossary#dormant) listing has history but nobody selling now. It's judged on the past 12 months instead: rank drops over 12 months as a monthly rate, the 12-month average rank, and your share (the monthly rate, shared with nobody).

## When it runs

**After Keepa history.** A current rank alone says nothing about sales, so without history the gate is skipped rather than passed. If Keepa isn't set up, it's always skipped.

## Settings

Settings, **Gates** tab, card **8 Demand** (Needs: Keepa / SP-API).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **off**, **warn** or **fail**. |
| **Min sales / month (total)** | 30 | Lower it to accept slower sellers. |
| **Min your share (sales / month)** | 5 | Lower it to accept crowded listings where you'd sell fewer. |
| **Max 90-day average rank** | 50,000 | Raise it to accept products further down the rankings. Used for any category not in the table below. |
| **Max rank by category** | Beauty 60,000; Health & Personal Care 60,000; Grocery 50,000; Automotive 150,000; DIY & Tools 150,000; Sports & Outdoors 150,000; Home & Kitchen 200,000 | A rank means different sales in different categories: tighter in Beauty, Grocery and Health, looser in the big categories. Change a value, remove a category (it then uses the max above), add one from the list, or **Reset to suggested**. Names are matched loosely ("Health & Household" counts as Health & Personal Care). Every shipped profile starts with this table. |
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

When a category's own ceiling applies, the line says which: "90-day average rank 70,000, over 60,000 for Beauty" on a fail, and "… avg rank 12,000 (Beauty max 60,000)" on a pass. Without "for …", the profile-wide ceiling was used.

When it trips, each failed check is listed, joined with "; ".

| Status | Example | Meaning |
|---|---|---|
| fail / warn | 18 sales in 30 days, under 30 | Too few sales in total. |
| fail / warn | your share 3.8/mo, under 5 (30 sales ÷ 7 other sellers, Amazon counted as 3 + you) | 4 FBA sellers plus Amazon counted as 3, plus you: 30 ÷ 8. |
| fail / warn | 47 units at 6/mo = 7.8 months, over 3 | The first order takes too long to sell at your share. |
| fail / warn | 96 units (MOQ) at 12/mo = 8 months, over 3 | The MOQ is bigger than the line cap buys, so the order is the MOQ. |
| fail / warn | 43 units at 0/mo = never at your share, over 3 | No sales, so the order never sells. |
| fail / warn | 90-day average rank 72,400, over 50,000 | Rank too low. Reads "current rank …" when there's no 90-day average. |
| fail / warn | no rank in the last 90 days | No rank at all. |
| pass | 60 sales/mo, your share 15/mo, avg rank 8,210; order 40 sells in 2.7 months | |
| fail / warn | dormant: no sales history (Keepa has no sales rank for it in 12 months) | Dormant with nothing to go on. Also "(no rank drops in 12 months)". Tagged DORMANT. |
| fail / warn | dormant: 120 rank drops in 12 months (10/mo), under 30/mo | Dormant, too slow. |
| pass | dormant: 480 rank drops in 12 months (40/mo), 12-month average rank 15,300; order 40 sells in 1 month | Dormant but sold well over the year. |
| skipped | Needs Keepa history to count sales (current rank 12,345) | No history yet. Or just "Needs Keepa history". |
| off | Gate off in this profile | |

## What to do about a fail

- **Too few sales or a poor rank**: usually a real no. Check the rank history on Keepa for a seasonal dip.
- **Your share too low**: too many sellers. See [Competition shape](/help/gates/competition).
- **Months to sell too high**: a smaller first order helps. Lower **Max first order per line** or ask the supplier for a smaller MOQ.
- To change the thresholds, see [change a threshold](/help/howto/change-a-threshold). To accept this product, [waive the gate](/help/howto/waive-a-gate).
- On a single check that stopped before Keepa, **Fetch anyway** on the [Check](/help/pages/check) page fetches the history this gate needs.
