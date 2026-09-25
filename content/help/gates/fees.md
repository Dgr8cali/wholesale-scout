---
title: Fee engine
summary: Works out profit, ROI and margin after Amazon's fees and drops products that don't clear your floors.
synonyms: [profit, roi, margin, fba fee, referral fee, hurdle price, max landed, fees]
gate: fees
order: 12
---
The fee engine is the last gate. It works out what you'd make on each unit at the scoring price, after Amazon's referral and FBA fees, storage, returns, VAT and your landed cost, and checks it against your minimum profit, ROI and margin.

## What it checks

At the scoring price (see [Price band](/help/gates/priceBand) for how that's chosen):

- **Profit per unit** at least **Min profit / unit**.
- **ROI** (profit ÷ landed cost) at least **Min ROI**.
- **Margin** (profit ÷ sell price) at least **Min margin**.

Any miss trips the gate. The [hurdle price](/help/reference/glossary#hurdle-price) is the lowest sell price that clears all three.

Fees come from Amazon's own fee estimate for your account where it answers, else the rate card. The FBA fee needs the product's size: from the SP-API catalog, else Keepa, else the assumed size on the **Fees** tab. See [fees](/help/concepts/fees) for the whole sum.

With no cost (an ASIN check on the [Check](/help/pages/check) page), there's no profit to test. The gate is skipped and shows the [max landed](/help/reference/glossary#max-landed) cost instead: the most a unit can cost you and still clear the floors.

## When it runs

**In the account stage**, the last step. It asks Amazon's fee estimate there (20 at a time) for rows that pass the other gates, then gives the verdict.

## Settings

Settings, **Gates** tab, card **12 Fee engine** (Needs: Rate card / SP-API).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **off**, **warn** or **fail**. |
| **Min profit / unit (£)** | £2.00 | Raise it to demand more cash per unit. |
| **Min ROI (%)** | 20 | Raise it to demand a better return on stock. |
| **Min margin (%)** | 15 | Raise it to demand more headroom against price drops. |

Changing these also moves the hurdle price and max landed. Fee assumptions (VAT, prep, inbound, storage, returns, assumed size) are on the **Fees** tab.

## Mode in each profile

| Profile | Mode | Min profit | Min ROI | Min margin |
|---|---|---|---|---|
| First order (default) | fail | £2.50 | 25% | 12% |
| Strict | fail | £2.00 | 25% | 18% |
| Test order | fail | £2.00 | 20% | 15% |
| Dry goods only | fail | £2.00 | 20% | 15% |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| fail / warn | At £14.99: profit £1.42 < £2.00, ROI 16% < 20%; passes at £16.29 | The floors it misses, and the hurdle price that would clear them. |
| fail / warn | At £14.99: margin 12% < 15%; passes at £15.60; size tier disagreement: SP-API catalog says Small parcel, Keepa says Standard parcel | The catalog's size and Keepa's put it in different FBA tiers, so check the fee. Tagged TIER_MISMATCH. |
| fail / warn | No FBA fee: Standard parcel | No FBA fee could be worked out for this size tier, or "No FBA fee: unknown size". |
| pass | £3.12 profit, 34% ROI, 22% margin at £18.49 | Clears every floor. |
| pass | £3.12 profit, 34% ROI, 22% margin at £18.49 (size assumed) | No dimensions: the assumed size on the Fees tab was used. Or "(size from Keepa)". |
| skipped | No sell price: see hurdle price | No price to test at. The details show the hurdle price. |
| skipped | No cost given: clears the floors at £7.40 landed or less (sells at £18.49) | An ASIN check with no cost: £7.40 is the max landed. |
| skipped | No cost given: at £6.99 not even a free unit clears the floors | Fees alone eat the price. |
| skipped | No cost given, and no sell price yet | |
| off | Gate off in this profile | |

Fees from Amazon's estimate are tagged AMAZON_FEE. Profit, profit a month, ROI and margin also make up the Margin group of the [score](/help/concepts/score).

## What to do about a fail

- Compare the hurdle price with the Buy Box history. If the Buy Box regularly sits above the hurdle, it may just be the scoring rule taking a low median.
- Negotiate the cost: the max landed tells you what price you'd need.
- Check the size tier if the why-line mentions a disagreement: a wrong tier can swing the FBA fee.
- To change the floors, [change a threshold](/help/howto/change-a-threshold). To accept this product, [waive the gate](/help/howto/waive-a-gate).
