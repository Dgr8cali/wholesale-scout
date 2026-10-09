---
title: Price regime
summary: Flags a Buy Box that has spiked more than 15% above its 90-day median (an amber Price spike tag); the price basis in Settings → Business decides the price profit uses.
synonyms: [spike, price spike, buy box spike, median, stock-out, temporary price]
gate: priceRegime
order: 9
---
Price regime catches a temporary [spike](/help/reference/glossary#spike): the Buy Box is well above its usual level because sellers have run out. When they restock, the price drops back, so profit worked out at the spike price is a trap.

## What it checks

The current Buy Box is more than **Spike tolerance over median** (15%) above its **90-day median** Buy Box. The why-line says so ("Price spike: Buy Box £31.00 is 24% over the £25.00 90-day median, with offers falling") and the card shows an amber **Price spike** tag. Falling offers are mentioned but aren't needed.

The gate no longer re-prices: the **price basis** (Settings → Business) decides the price profit is worked out at. The default, **Conservative**, already takes the lower of the current Buy Box and the 90-day median, so a spike doesn't flatter the profit. With **Current Buy Box** chosen, a spike is tagged and the profit is at the current price, as SellerAmp shows it.

## When it runs

**After Keepa history.** It needs the current Buy Box and the 90-day median (screenings stored before that was kept work it out from the stored Buy Box history on Re-check, with no Keepa call).

## Settings

Settings, **Gates** tab, card **9 Price regime** (Needs: Keepa).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **warn** | **off** also stops the switch to the median; **warn** flags it; **fail** drops the row. |
| **Spike tolerance over median (%)** | 15 | Raise it to allow bigger rises before calling a spike. |

## Mode in each profile

| Profile | Mode | Spike tolerance |
|---|---|---|
| First order (default) | warn | 15% |
| Strict | warn | 15% |
| Test order | warn | 15% |
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
