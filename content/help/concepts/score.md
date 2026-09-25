---
title: Score
summary: How the 0–100 win score is built from six weighted groups, and how a row lands in green, amber or grey.
synonyms: [win score, band, green, amber, grey, weights, scales, score groups]
order: 1
---
The score ranks the rows that got through the gates, so you can see which products are most worth a test order. It runs from 0 to 100 and puts each scored row in a band: green, amber or grey.

The [gates](/help/pages/settings) decide whether a row is in or out. The score only ranks what's left: a row that failed a gate in fail mode has no score.

## How the score is built

There are three layers.

1. **Parameters.** Each row has up to 24 measured values (rank drops, seller count, profit and so on). Each one goes through its own scale, which turns the value into a number from 0 to 100.
2. **Groups.** The parameters fall into six groups. A group's score is the weighted average of its parameters' scores.
3. **Total.** The total is the weighted average of the group scores, using the group weights. It's rounded to one decimal place.

### Scales

A scale is a list of points, each a value and a score. Between two points the score follows a straight line. Below the first point and above the last, it stays flat at that point's score.

For example, the default **Rank drops / 30 days** scale has two points: 10 drops scores 0, and 200 drops scores 100. So 105 drops scores 50, 5 drops scores 0 and 400 drops scores 100.

### Weights inside a group

Each parameter has a weight inside its group. Every default weight is 1, so each parameter in a group counts equally. Set a weight to 0 to leave that parameter out.

### Group weights

The group weights set how much each group counts towards the total. They must add up to 100.

| Group | Default weight |
|---|---|
| Demand | 25 |
| Competition | 20 |
| Price health | 15 |
| Margin | 25 |
| Risk | 10 |
| Fit | 5 |

## The parameters and their default scales

Each scale below is written as value → score. Straight lines join the points.

### Demand

| Parameter | What it reads | Default scale |
|---|---|---|
| **Rank drops / 30 days** | Rank drops in the last 30 days from the Keepa history | 10 → 0, 200 → 100 |
| **90-day average rank** | Keepa's 90-day average rank, or the current rank if there isn't one | 1,000 → 100, 20,000 → 70, 50,000 → 40, 150,000 → 0 |
| **12-month rank trend (negative = improving)** | Change in average rank against a year ago, % | −30 → 100, 0 → 70, 30 → 20, 60 → 0 |

For a [dormant](/help/reference/glossary#dormant) listing (nobody selling it now), rank drops are the past 12 months' drops ÷ 12, and the average rank is the 12-month average.

### Competition

| Parameter | What it reads | Default scale |
|---|---|---|
| **FBA seller count** | FBA offers now, or all offers if Keepa has no FBA count | 1 → 40, 3 → 90, 4 → 100, 6 → 100, 12 → 30, 20 → 0 |
| **Days since Amazon last sold** | Days since Amazon last held an offer. Never = 10,000 days. Needs Keepa history | 0 → 0, 365 → 70, 730 → 100 |
| **Top seller's Buy Box share** | The share of the last year one seller held the Buy Box, % (stage-2 Buy Box data) | 30 → 100, 50 → 80, 70 → 40, 100 → 0 |
| **Offer count change vs 90 days ago** | (offers now ÷ offers 90 days ago − 1) × 100 | −30 → 100, 0 → 70, 30 → 30, 70 → 0 |

### Price health

| Parameter | What it reads | Default scale |
|---|---|---|
| **Current vs 12-month median** | (current Buy Box ÷ 12-month median − 1) × 100 | −25 → 30, −5 → 100, 0 → 100, 15 → 40, 40 → 0 |
| **12-month Buy Box slope** | The Buy Box trend over the year, % a year | −30 → 0, −10 → 50, 0 → 85, 10 → 100 |
| **Buy Box volatility** | Standard deviation of the daily Buy Box ÷ its mean over 12 months, % | 0 → 100, 10 → 80, 30 → 25, 50 → 0 |

### Margin

| Parameter | What it reads | Default scale |
|---|---|---|
| **Net profit per unit** | Profit per unit at the scoring price, £ | 0 → 0, 2 → 30, 5 → 80, 8 → 100 |
| **Your profit a month (your share × profit per unit)** | [Your share](/help/reference/glossary#your-share) × profit per unit, £ a month | 0 → 0, 25 → 40, 100 → 80, 250 → 100 |
| **ROI** | Profit ÷ landed cost, % | 10 → 0, 60 → 100 |
| **Net margin** | Profit ÷ sell price, % | 10 → 0, 15 → 40, 35 → 100 |

The money comes from the [fee engine](/help/concepts/fees).

### Risk

| Parameter | What it reads | Default scale |
|---|---|---|
| **Compliance flags** | Compliance rules matched (rules set to off don't count) | 0 → 100, 1 → 55, 2 → 25, 3 → 0 |
| **Mirage flag (1 = flagged)** | 1 if the [mirage](/help/reference/glossary#mirage) gate warned, 0 if it passed | 0 → 100, 1 → 15 |
| **Gating (0 open, 1 unknown, 2 approval needed)** | 0 open (or a brand you've recorded as approved), 1 unknown, 2 approval needed or blocked | 0 → 100, 1 → 70, 2 → 35 |
| **Brand-lock pattern (1 = one seller holds ≥ 90%)** | 1 if a likely brand distributor was flagged, or one seller held 90% or more of the Buy Box; else 0 | 0 → 100, 1 → 20 |
| **Variation count** | Listings in the variation family | 1 → 100, 10 → 75, 50 → 30 |
| **Other warn-mode gates tripped** | Gates that warned, apart from compliance, mirage, gating and match quality. Waived gates count here | 0 → 100, 1 → 65, 2 → 40, 4 → 0 |

### Fit

| Parameter | What it reads | Default scale |
|---|---|---|
| **Order cost as share of budget** | MOQ × landed cost ÷ the profile's budget, % | 0 → 100, 30 → 90, 60 → 50, 100 → 0 |
| **MOQ** | The line's MOQ; with none, the units needed to reach the supplier's minimum order value; else 1 | 1 → 100, 24 → 85, 100 → 45, 500 → 0 |
| **Delivery time** | The supplier's delivery time, days | 1 → 100, 3 → 90, 7 → 60, 21 → 0 |
| **Supplier ledger rating** | The supplier's rating, 0–5 | 0 → 30, 3 → 70, 5 → 100 |

## Missing data

A parameter with no value is left out of its group. The group averages whatever is left. A group with nothing left has no score and shows **—** in the row details.

The total averages only the groups that have a score, so the weights of the missing groups are spread over the rest.

Two groups are required. With no **Margin** score (no sell price, or no cost) or no **Demand** score (no rank data), the row isn't scored. Otherwise the other groups on their own could rank an unknown product highly. The why-line then says what's missing, for example:

- "Not scored: needs a sell price. Clears the profit floors at £21.51 or more."
- "Not scored: needs a cost and rank data. Clears the floors at £12.30 landed or less."

The price in the first example is the [hurdle price](/help/reference/glossary#hurdle-price). The one in the second is the [max landed](/help/reference/glossary#max-landed) cost.

## Bands

| Band | Default | Settings label |
|---|---|---|
| Green | 75 or more | **Green (order a test) from** |
| Amber | 55 to under 75 | **Amber (needs one thing to move) from** |
| Grey | under 55 | (anything below amber) |

A row with no Keepa history can't be green. One reading of rank and price isn't enough to order stock on, so the row is held at amber and the why-line ends "; held at amber until there's history."

## The why-line

Every scored row gets one sentence that starts with the rounded score. It names the strong groups (score 60 or more) in this order: demand, competition, price, margin. Then comes "Watch:" with the two weakest groups under 60 and any important warnings (approval needed, spike, erosion, several ASINs, brand distributor, waived, pack mismatch, Amazon dangerous goods, a size-tier disagreement, an IP-risk brand). For example:

"82 — strong demand (140 drops/mo), four sellers, no Amazon, price at median, 24% margin (£6.00 profit). First order 30 units sells in 2.5 months."

A row with a weak spot adds it after "Watch:", e.g. "Watch: thin demand (18 drops/mo); Approval needed (Nuxe)…".

Other endings you might see:

- "No Keepa history yet: mirage, Amazon and price-trend gates not checked." The row was scored before Keepa history was fetched.
- "First order 30 units sells in 2.5 months." See [months to sell](/help/reference/glossary#months-to-sell).
- A dormant row starts with "Dormant: no seller for 120 days; priced on the last seen £12.99 on 3 Mar 2026."

A row that failed a gate reads "Failed <gate>: <reason>" instead.

## Changing the score

Open [Settings](/help/pages/settings) and go to the **Score** tab. Choose the profile in **Editing**.

| Control | What it does |
|---|---|
| **Score on** (under **Scoring price**) | The sell price used for fees, profit and the score: **Lower of current Buy Box and 12-month median** (default), **Current Buy Box** or **12-month median** |
| **Score weights** | A slider and a box per group. The total shows as **Total N / 100**. While it isn't 100, the profile bar shows "Score weights total N, not 100" and **Save** is disabled |
| **Green (order a test) from** / **Amber (needs one thing to move) from** | The band thresholds |
| **Score scales** | Each parameter's points (value → score) and its **weight**. **+ point** adds a point; **×** removes one (a scale keeps at least two) |

Press **Save** to keep the changes. Runs keep their own copy of the profile, so re-screen a run to see the new scores. See [Profiles](/help/concepts/profiles) and [Change a threshold](/help/howto/change-a-threshold).
