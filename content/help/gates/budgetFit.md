---
title: Budget fit
summary: Drops lines whose smallest first order would take more than one line's share of your budget.
synonyms: [moq, mov, minimum order, line cap, budget, order size]
gate: budgetFit
order: 3
---
Budget fit stops one line from swallowing your budget. It works out the smallest first order the supplier lets you place and compares it with the most you want to spend on any one line.

## What it checks

- **Line cap** = your **Budget** × **Max first order per line** ÷ 100.
- **Smallest first order** = units × landed cost per unit. Units are the line's MOQ. With no MOQ but a supplier minimum order value (MOV), it's enough units to reach the MOV (a £150 MOV and £5.00 items needs 30). With neither, it's one unit.
- Landed cost is the supplier's price plus VAT, duty, prep and inbound, as set on the **Fees** tab (see [fees](/help/concepts/fees)).

The gate trips when the smallest first order is over the line cap, or when the supplier's MOV alone is over your whole budget.

For a [multipack](/help/reference/glossary#multipack) listing, cost and MOQ are counted per Amazon listing (a 3-pack costs three singles). For Qogita rows, once the supplier offers are in, the MOQ and MOV are those of the supplier the app chose. A supplier's MOV comes from its record on the [Suppliers](/help/pages/suppliers) page (**MOV**).

## When it runs

**Before any API call.** It only needs the row and your budget, so a fail costs nothing. It runs again at every later pass with the same inputs (for Qogita rows, with the chosen supplier's terms).

## Settings

Settings, **Gates** tab, card **3 Budget fit** (Needs: Row + ledger). The budget itself is on the **Profiles** tab.

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **off**, **warn** or **fail**. |
| **Max first order per line (% of budget)** | 100 | Lower it to spread your budget over more lines; 100 lets one line take the lot. |
| **Budget (£)** (Profiles tab) | £1,000 | The total first order. The line cap scales with it. |

The line cap also sets the first-order quantity that [Demand](/help/gates/demand) uses for [months to sell](/help/reference/glossary#months-to-sell).

## Mode in each profile

| Profile | Mode | Max first order per line | Line cap at £1,000 budget |
|---|---|---|---|
| Strict | fail | 100% | £1,000 |
| Test order (default) | fail | 30% | £300 |
| Dry goods only | fail | 100% | £1,000 |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| fail / warn | MOQ 48 × £6.90 = £331.20, over the £300.00 line cap; 43 units fit | The MOQ at landed cost is over the cap; the cap would buy 43. "not one unit fits" means even one unit is over it. |
| fail / warn | No line MOQ: the supplier's £400.00 minimum order is 80 × £5.90 = £472.00, over the £300.00 line cap; 50 units fit | No MOQ on the line, so the supplier's MOV sets the order. Tagged MOV. |
| fail / warn | Supplier minimum order £1500.00 is over the £1000.00 budget | The supplier's MOV is bigger than your whole budget. |
| pass | First order £240.00 of £1000.00 | The smallest order, against the whole budget. |
| pass | First order £177.00 of £1000.00 (30 units to reach the supplier's £150.00 minimum order) | Sized by the MOV. |
| skipped | No cost given | An ASIN check with no cost: there's nothing to size. |
| off | Gate off in this profile | |

## What to do about a fail

- Ask the supplier for a smaller MOQ, then update the sheet and re-screen.
- Raise **Max first order per line** or your **Budget**: see [change a threshold](/help/howto/change-a-threshold).
- Check the supplier's **MOV** on the [Suppliers](/help/pages/suppliers) page is right.
- To accept this one line, [waive the gate](/help/howto/waive-a-gate).
- On a single check, **Fetch anyway** on the [Check](/help/pages/check) page carries on past this gate and fetches everything.
