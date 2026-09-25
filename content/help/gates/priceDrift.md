---
title: Price drift
summary: Flags a Buy Box that has been falling steadily over the past year.
synonyms: [erosion, price erosion, falling price, price trend, race to the bottom, slope]
gate: priceDrift
order: 10
---
Price drift catches [erosion](/help/reference/glossary#erosion): a Buy Box that keeps sliding over the year, usually because sellers undercut each other. Today's margin may not last until your stock sells.

## What it checks

The 12-month trend (slope) of the Buy Box from Keepa's history, as a % a year. A decline steeper than **Max Buy Box decline** trips the gate.

## When it runs

**After Keepa history.** Without history, or without a Buy Box trend, it's skipped.

## Settings

Settings, **Gates** tab, card **10 Price drift** (Needs: Keepa).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **warn** | **off**, **warn** or **fail**. |
| **Max Buy Box decline (% / year)** | 20 | Lower it to be stricter about falling prices; raise it to tolerate them. |

## Mode in each profile

| Profile | Mode | Max decline |
|---|---|---|
| First order (default) | warn | 20% a year |
| Strict | warn | 20% a year |
| Test order | warn | 20% a year |
| Dry goods only | warn | 20% a year |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| warn / fail | EROSION: Buy Box falling 27% a year | Falling faster than your maximum. Tagged EROSION. |
| pass | Buy Box trend -8% a year | Falling, but within tolerance. |
| pass | Buy Box trend +4% a year | Rising or flat. |
| skipped | Needs Keepa history | |
| off | Gate off in this profile | |

The same slope also feeds the Price health group of the [score](/help/concepts/score) (**12-month Buy Box slope**), so a pass with a falling price still scores lower.

## What to do about a warning or fail

- Work out the profit at a lower price: the [hurdle price](/help/reference/glossary#hurdle-price) shows the lowest sell price that still clears your floors. If the Buy Box is heading below it within a few months, pass.
- To change the tolerance, [change a threshold](/help/howto/change-a-threshold). To accept this product, [waive the gate](/help/howto/waive-a-gate).
