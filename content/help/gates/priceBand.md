---
title: Price band
summary: Drops products whose sell price is outside the range you want to trade in.
synonyms: [price range, min sell price, max sell price, floor, ceiling, sell price]
gate: priceBand
order: 1
---
The price band keeps you to products that sell within a price range you choose. Very cheap items leave too little after fees; expensive ones tie up too much cash per unit.

## What it checks

It compares the product's scoring price (the sell price fees, profit and the score use) with your **Min sell price** and **Max sell price**. Below the min or above the max trips the gate.

The scoring price follows the **Score on** setting in Settings, **Score** tab, **Scoring price** section:

- **Lower of current Buy Box and 12-month median** (the default in every shipped profile).
- **Current Buy Box**.
- **12-month median**.

Two exceptions apply whatever that setting says. When the Buy Box is a [spike](/help/reference/glossary#spike) (see [Price regime](/help/gates/priceRegime)), the 12-month median is used. When the listing is [dormant](/help/reference/glossary#dormant) (nobody selling now), the last Buy Box seen in the past 12 months is used.

## When it runs

It needs a sell price, so it can't run before any API call.

- **Before Keepa**, only when the fail is certain from Amazon's current offers (free SP-API data): the gate is set to **fail**, and either you score on the lower price and today's Buy Box is already under the min, or you score on the current Buy Box and it's outside the band. The row then stops without spending a Keepa token, with the note "Ruled out from current offers before any Keepa token."
- **After Keepa history** otherwise, with the other history gates. If Keepa isn't set up, it runs on the SP-API price straight after the lookup.

## Settings

Settings, **Gates** tab, card **1 Price band** (Needs: Row).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **off** skips the gate; **warn** keeps the row and flags it; **fail** drops the row. |
| **Min sell price (£)** | £12.00 | Raise it to drop cheaper items; lower it to let low-price lines through. |
| **Max sell price (£)** | £40.00 | Raise it to allow dearer items. |

See [change a threshold](/help/howto/change-a-threshold).

## Mode in each profile

First order lowers the ceiling to £35.00; the other shipped [profiles](/help/concepts/profiles) use the defaults.

| Profile | Mode | Min | Max |
|---|---|---|---|
| First order (default) | fail | £12.00 | £35.00 |
| Strict | fail | £12.00 | £40.00 |
| Test order | fail | £12.00 | £40.00 |
| Dry goods only | fail | £12.00 | £40.00 |

## Reading the why-line

| Status | Why-line | Example | Meaning |
|---|---|---|---|
| fail / warn | `Sells at £X, under the £MIN floor` | Sells at £9.99, under the £12.00 floor | The scoring price is below your min. |
| fail / warn | `Sells at £X, over the £MAX ceiling` | Sells at £45.50, over the £40.00 ceiling | The scoring price is above your max. |
| pass | `£X is inside £MIN–£MAX` | £18.49 is inside £12.00–£40.00 | Inside the band. |
| skipped | No sell price yet | | No Buy Box, median or last-seen price yet. It's never failed for missing data. |
| off | Gate off in this profile | | The profile has the gate off. |

It shows as fail when the gate's mode is **fail**, and as warn when it's **warn**.

## What to do about a fail

- The scoring price may be low because of the "lower of" rule. Check **Sells at** and its source in the result's details. If the median is dragging it down and you trust today's price, change **Score on** and re-screen.
- To take cheaper or dearer items generally, [change the threshold](/help/howto/change-a-threshold).
- To accept this one product anyway, [waive the gate](/help/howto/waive-a-gate): the fail becomes a warning and later gates still run.
- On a single check that stopped here before Keepa, **Fetch anyway** on the [Check](/help/pages/check) page gathers sales and history anyway. The verdict is still decided by the gates.
