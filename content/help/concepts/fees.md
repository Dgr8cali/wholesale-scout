---
title: Fee engine
summary: Where each per-unit number comes from: referral and FBA fees, storage, returns, VAT and DSF, landed cost, profit, hurdle price and max landed.
synonyms: [fba fee, referral fee, vat, dsf, digital services fee, rate card, size tier, landed cost]
order: 2
---
The fee engine turns a sell price and a supplier cost into profit per unit. It is what the [Fee engine gate](/help/gates/fees) checks and what the Margin group of the [score](/help/concepts/score) reads. Every row's details show the result in a **Per unit at £…** block.

## The per-unit block

Here is an example at a £24.99 sell price, using the default profile and the rate card. The item is "Everything else", 20 × 15 × 8 cm and 300 g, with an £8.00 ex-VAT cost and 20% VAT on the goods. You are not VAT registered, and it's September:

| Line | Example | How it's worked out |
|---|---|---|
| **Referral (15%, Everything else)** | £4.59 | Price × the category's referral rate (minimum £0.25), × the fee multiplier |
| **FBA (Small parcel, standard)** | £3.72 | The FBA fee for the size tier and weight, × the fee multiplier |
| **Storage** | £0.13 | Cubic feet × the monthly rate × months in storage, × the fee multiplier |
| **Returns allowance** | £0.50 | Price × the returns allowance (2%) |
| **Output VAT** | (not shown) | Only when you're VAT registered |
| **Landed cost** | £10.05 | £8.00 goods + £1.60 VAT + £0.30 inbound + £0.15 prep |
| **Profit** | £6.00 | £24.99 − £8.94 fees − £10.05 landed |

ROI is profit ÷ landed cost (59.7% here). Margin is profit ÷ sell price (24.0% here).

Under the lines, a note says where the fees came from: "Referral and FBA from Amazon's fee estimate" or "Fees from the rate card". It also says "DSF and VAT on fees included", adds "; size assumed (no dimensions)" when there were no dimensions, and names the price used, e.g. "Price: current Buy Box."

The block's heading uses the **scoring price** set in the profile (see [Score](/help/concepts/score#changing-the-score)). A row with no price shows "No sell price yet." and, if there is one, "Clears the floors at £X." with the [hurdle price](/help/reference/glossary#hurdle-price).

## Referral and FBA: Amazon's estimate or the rate card

### Amazon's fee estimate (SP-API)

In the account stage, the app asks SP-API for Amazon's own fee estimate for every matched row that has a price and isn't blocked. It asks in batches of 20. Amazon returns a referral fee and FBA fees at that price. The app removes Amazon's tax from them, so they are ex-VAT and ex-DSF like the rate card. The FBA line then shows the source **amazon**.

Amazon's figure is only good for the price it was quoted at. If the scoring price changes later (you switch the profile's price rule and re-screen, say), the rate card is used instead and the why-line says, for example, "Amazon's fee was quoted at £24.99; rate card used at £22.50." If the estimate call fails, the rate card is used and the why-line says "Amazon fee estimate failed, rate card used: …".

### The rate card

The rate card is Amazon UK's FBA rate card (effective 1 July 2026) stored as data. All its amounts are GBP, ex-VAT and ex-DSF. It is shared by every profile. You can edit it in [Settings](/help/pages/settings) → **Fees** → **Rate card**: **Load into editor** puts a saved card into the JSON box, and **Save as new version** saves it and keeps the old one for comparison.

**Referral.** The product's referral category comes from Amazon's browse category through the card's category map. A category the map doesn't know uses **Everything else** (15%). A band's rate applies to the whole price. For example, Beauty, Health and Personal Care is 8% up to £10 and 15% above. The minimum referral fee is £0.25.

**FBA fee.** The fee depends on the size tier and the shipping weight:

| Tier | Max dimensions (cm, longest first) | Max weight |
|---|---|---|
| Light envelope | 33 × 23 × 2.5 | 100 g |
| Standard envelope | 33 × 23 × 2.5 | 460 g |
| Large envelope | 33 × 23 × 4 | 960 g |
| Extra-large envelope | 33 × 23 × 6 | 960 g |
| Small parcel | 35 × 25 × 12 | 3,900 g |
| Standard parcel | 45 × 34 × 26 | 11,900 g |
| Small oversize, Standard oversize light/heavy | up to 101 × 60 × 60 | up to 23 kg |

Envelopes are billed on actual weight. Parcels and oversize are billed on the greater of actual weight and dimensional weight (L × W × H ÷ 5,000, in kg). An item too big for every tier is "Outside rate-card tiers". It has no FBA fee, so the Fee engine gate fails it with "No FBA fee: Outside rate-card tiers".

The FBA line names the fee used:

| Source | When |
|---|---|
| **amazon** | Amazon's estimate at this price |
| **low-price** | The price is at or under £20 (£10 for Beauty, Health and Personal Care, Office Products, and Grocery and Gourmet) and the tier has a low-price fee for this weight |
| **peak** | Peak season (October to December) and the tier has a peak surcharge (Small parcel: +£0.11) |
| **standard** | The normal fee |
| **assumed-tier** | No dimensions: the tier in the profile's fee settings |

**Storage.** Cubic feet × £0.62 a month (£0.82 in October to December) × **Average months in storage** (default 2).

## Size and missing dimensions

The package size comes from, in order:

1. the SP-API catalog's dimensions and weight;
2. Keepa's package dimensions. The fees-by-source table then says "Size from Keepa (no catalog dimensions)." and the Fee engine gate adds "(size from Keepa)";
3. neither: the tier and weight in **No dimensions: assume tier** (default **Small parcel**) and **No dimensions: assume weight** (default 400 g). Storage uses a middle-sized box for that tier (25 × 18 × 8 cm for a small parcel). The block adds "size assumed (no dimensions)" and the Fee engine gate adds "(size assumed)".

When the catalog and Keepa put the item in different tiers, the Fee engine gate adds, for example, "size tier disagreement: SP-API catalog says Small parcel, Keepa says Standard parcel". The same text appears under "Watch" in the why-line.

## VAT and the digital services fee

**The fee multiplier.** Amazon charges the digital services fee (DSF, default 2%) on top of its fees, and VAT on both. So the referral, FBA and storage lines are the base fee × (1 + DSF) × (1 + VAT). With the defaults that's 1.02 × 1.20 = 1.224. If you're VAT registered you reclaim the VAT on fees, so the multiplier is just 1.02. The returns allowance isn't multiplied.

**VAT on goods.** If you're not VAT registered, the supplier's VAT on the goods (and duty) is part of the landed cost. The rate is the supplier's VAT rate, e.g. 0% for zero-rated goods. If you're registered, you reclaim it, so it isn't counted.

**Output VAT.** If you're VAT registered, you pay VAT on each sale. The **Output VAT** line is price × rate ÷ (100 + rate), using the goods' VAT rate. At £24.99 and 20% that's £4.17, and it comes off the sale before profit. Not registered: there's no output VAT line.

In the example above, turning on VAT registration gives £7.53 fees, £8.45 landed, £4.17 output VAT and £4.84 profit.

## Fees by source

Under the per-unit block, **Fees by source (ex-VAT)** shows the referral and FBA fee from each source at the same price, before DSF and VAT:

| Row | What it shows |
|---|---|
| **Amazon (SP-API)** | Amazon's estimate, if one was quoted at this price |
| **Keepa** | Keepa's referral % × price (minimum £0.25) and Keepa's FBA pick-and-pack estimate |
| **Rate card (tier)** | The rate card's figures and the tier it picked |

A dash means that source has no figure. Only Amazon's estimate or the rate card goes into profit. Keepa's figures are there for comparison.

## Fee settings in a profile

These are in [Settings](/help/pages/settings) → **Fees** → **Fees and landed cost**, per profile:

| Setting | Default | What it changes |
|---|---|---|
| **VAT registered (reclaim VAT on fees and stock; pay output VAT on sales)** | Off | See above |
| **VAT rate** | 20% | VAT on Amazon's fees; the goods' rate comes from the supplier |
| **Digital services fee** | 2% | Added to referral, FBA and storage |
| **Inbound to FBA** | £0.30 per unit | Added to landed cost |
| **Prep, bag and label** | £0.15 per unit | Added to landed cost |
| **Import duty** | 0% of cost | Added to landed cost (VAT applies on top when not registered) |
| **Average months in storage** | 2 | Storage fee |
| **Returns allowance** | 2% of sale | The returns line |
| **Storage and peak rates** | **By date (Oct–Dec is peak)** | Or **Always standard** / **Always peak** |
| **No dimensions: assume tier** | Small parcel | Tier for items with no size |
| **No dimensions: assume weight** | 400 g | Weight for items with no size |

The floors (**Min profit / unit** £2, **Min ROI** 20%, **Min margin** 15%) are on the **Gates** tab under the Fee engine gate.

## Landed cost

Landed cost per unit = unit cost ex-VAT + duty + VAT on goods and duty (only if not registered) + inbound + prep.

The unit cost is the supplier's price converted to £. For a [multipack](/help/reference/glossary#multipack) listing it's the price of all the supplier's items one listing needs. Inbound and prep are counted once per listing.

## Hurdle price

The hurdle price is the lowest sell price that clears all three floors (min profit, min ROI and min margin) at this row's cost. Fees jump at referral bands and at the low-price threshold, so profit doesn't rise smoothly with price. The engine checks every £0.25 up to £500 (or 20 × the cost, if that's more), then finds the exact penny in the step where it first passes. The hurdle price always uses the rate card, because Amazon's estimate only holds at the one price it was quoted for.

In the example, the hurdle is £21.51. It shows in the **Hurdle** column, in the Fee engine gate ("…; passes at £21.51") and in the why-line of an unpriced row. See [hurdle price](/help/reference/glossary#hurdle-price).

## Max landed

When a row has no cost (a seller scan, or a check by ASIN alone), there's no profit to work out. Instead the engine finds the most a unit can cost landed and still clear every floor at the scoring price. Profit only falls as cost rises, so it narrows down the ex-VAT unit cost that just passes. It then turns that into a landed cost (VAT, duty, inbound and prep included) and rounds it down to the penny. It uses Amazon's estimate when there's one at that price.

In the example, at £24.99 the max landed is £12.30. The Fee engine gate shows "No cost given: clears the floors at £12.30 landed or less (sells at £24.99)". If even a free unit fails, it says "No cost given: at £24.99 not even a free unit clears the floors". See [max landed](/help/reference/glossary#max-landed).
