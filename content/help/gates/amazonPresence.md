---
title: Amazon presence
summary: Drops listings where Amazon itself sells, or has sold within the last year.
synonyms: [amazon retail, amazon on listing, amazon seller, 1p, vendor, amazon last seen]
gate: amazonPresence
order: 6
---
Amazon presence keeps you off listings where Amazon sells the product itself. When Amazon is on a listing it usually takes most of the Buy Box, and it can come back at any time.

## What it checks

Whether Amazon held an offer on the listing within the last **Amazon held an offer in the last** days.

- **Before Keepa**, Amazon's current offers (free SP-API data) show whether Amazon is selling right now.
- **With Keepa history**, the gate uses the days since Amazon was last on the listing.

## When it runs

- **Before Keepa**, from Amazon's current offers: if Amazon is selling now and the gate is set to **fail**, the row stops without spending a Keepa token, with the note "Ruled out from current offers before any Keepa token."
- **After Keepa history** for everything else. Without history (and Amazon not selling now) it's skipped.

## Settings

Settings, **Gates** tab, card **6 Amazon presence** (Needs: Keepa).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **off**, **warn** or **fail**. |
| **Amazon held an offer in the last (days)** | 365 | Lower it to accept listings Amazon left more recently; 0 only trips when Amazon is selling now. |

## Mode in each profile

| Profile | Mode | Days |
|---|---|---|
| Strict | fail | 365 |
| Test order (default) | fail | 365 |
| Dry goods only | fail | 365 |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| fail / warn | Amazon is selling now (current offers) | From SP-API's current offers, before any Keepa history. |
| fail / warn | Amazon is selling now | From Keepa: Amazon holds an offer today. |
| fail / warn | Amazon sold 42 days ago | Amazon was on the listing within your window. |
| pass | Amazon last sold 400 days ago | Outside your window. |
| pass | Amazon never on the listing | Keepa has never seen Amazon on it. |
| skipped | Needs Keepa history | No history yet, and Amazon isn't selling now. |
| off | Gate off in this profile | |

A trip is tagged AMAZON. The result's details and the [Check](/help/pages/check) card also show when Amazon was last seen as a date.

Days since Amazon last sold also feed the Competition group of the [score](/help/concepts/score), so a pass with Amazon a year ago still scores lower than a listing Amazon never touched.

## What to do about a fail

- Amazon on the listing now is usually a no. If it left some time ago, look at the Keepa history to see how often it comes back.
- To accept listings Amazon left sooner, lower the days: [change a threshold](/help/howto/change-a-threshold).
- To accept this one product, [waive the gate](/help/howto/waive-a-gate).
- On a single check that stopped here before Keepa, **Fetch anyway** on the [Check](/help/pages/check) page fetches sales and history anyway. The verdict still fails while the gate does.
