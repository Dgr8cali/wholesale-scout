---
title: Price regime
summary: Flags a Buy Box that has spiked well above its 12-month median while sellers leave, and scores on the median instead.
synonyms: [spike, price spike, buy box spike, median, stock-out, temporary price]
gate: priceRegime
order: 9
---
Price regime catches a temporary [spike](/help/reference/glossary#spike): the Buy Box is well above its usual level because sellers have run out. When they restock, the price drops back, so profit worked out at the spike price is a trap.

## What it checks

Both must be true:

- The current Buy Box is more than **Spike tolerance over median** above the 12-month median Buy Box.
- The offer count is falling: fewer offers now than 90 days ago.

When the gate trips, the scoring price switches to the 12-month median, whatever your **Score on** setting. That happens in **warn** mode too; only **off** stops it. So the [Fee engine](/help/gates/fees), [Price band](/help/gates/priceBand) and the score are all worked out at the median.

## When it runs

**After Keepa history.** It needs both the current Buy Box and a 12-month median.

## Settings

Settings, **Gates** tab, card **9 Price regime** (Needs: Keepa).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **warn** | **off** also stops the switch to the median; **warn** flags it; **fail** drops the row. |
| **Spike tolerance over median (%)** | 15 | Raise it to allow bigger rises before calling a spike. |

## Mode in each profile

| Profile | Mode | Spike tolerance |
|---|---|---|
| Strict | warn | 15% |
| Test order (default) | warn | 15% |
| Dry goods only | warn | 15% |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| warn / fail | SPIKE: Buy Box £24.99 is 32% over the £18.99 median with offers falling; scored on the median | A spike. Tagged SPIKE. |
| pass | Buy Box £18.49 vs median £18.99 | No spike (either the rise is within tolerance or offers aren't falling). |
| skipped | Needs Keepa history | No history, or no current Buy Box or median. |
| off | Gate off in this profile | |

The price source shown with the sell price reads "12-month median (spike)" when the switch happened.

## What to do about a warning or fail

- Look at the profit at the median, not today's price. If it still clears your floors, the product may be worth it even after the spike ends.
- To tolerate bigger rises, [change a threshold](/help/howto/change-a-threshold). To accept this product, [waive the gate](/help/howto/waive-a-gate); note the scoring price still uses the median.
