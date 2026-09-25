---
title: Glossary
summary: Exact meanings of the app's own terms, with the formulae and thresholds behind them.
synonyms: [definitions, terms, jargon, meaning, dictionary]
order: 1
---
The app's own words, defined exactly as the code works them out. Defaults are those of the shipped profiles; you can change most of them in [Settings](/help/pages/settings).

## Hurdle price

The lowest sell price at which a row clears all three profit floors of the [Fee engine gate](/help/gates/fees): min profit per unit (£2), min ROI (20%) and min margin (15%), at this row's landed cost.

Fees jump at referral bands and at the low-price FBA threshold (£20, or £10 in some categories), so profit doesn't rise smoothly with price. The app checks prices every £0.25 up to £500 (or 20 × the unit cost, if that's more), then finds the exact penny within the first step that passes. It uses the rate card, not Amazon's fee estimate, because Amazon's estimate is only good at the price it was quoted for. No price in that range passing means no hurdle price.

It shows in the **Hurdle** column, in the Fee engine gate ("…; passes at £21.51"), and in the why-line of a row with no sell price ("Clears the profit floors at £21.51 or more"). See [Fee engine](/help/concepts/fees#hurdle-price).

## Max landed

The reverse of the hurdle price, for a row with no cost (a seller scan, or a check by ASIN alone). It is the most a unit can cost you landed and still clear every profit floor at the row's scoring price. Landed means goods, plus VAT and duty where they apply, plus inbound and prep.

Profit only falls as cost rises, so the app narrows down the highest ex-VAT unit cost that still passes. It then turns that into a landed cost and rounds it down to the penny. If even a free unit fails the floors, there's no max landed: "No cost given: at £24.99 not even a free unit clears the floors".

Otherwise the Fee engine gate shows "No cost given: clears the floors at £12.30 landed or less (sells at £24.99)". See [Fee engine](/help/concepts/fees#max-landed).

## Your share

The sales a month you can expect once you're one of the sellers:

**your share = sales a month ÷ (other sellers + 1 for you)**, to one decimal.

- **Sales a month** is the highest of three figures: rank drops in the last 30 days (from the Keepa history), Keepa's own 30-day rank-drop count, and Amazon's "bought in past month" (via Keepa). It needs Keepa history.
- **Other sellers** is Keepa's FBA offer count. When Amazon is selling now, it counts as 3 sellers, because it takes the Buy Box far more than its share. Without an FBA count, all offers are used, with Amazon adding 2 more (it's already in that count once).
- A [dormant](#dormant) listing's share is its past year's rank drops ÷ 12, shared with nobody.

Example: 60 sales a month, 4 FBA sellers and Amazon selling: 60 ÷ (4 + 3 + 1) = 7.5 a month.

The [Demand gate](/help/gates/demand) needs at least 5 a month (**Min your share**). The column is **Your share / mo**. **Your profit / mo** is your share × profit per unit.

## Months to sell

How long your first order would take to sell at [your share](#your-share):

**months to sell = order quantity ÷ your share a month**

- **Order quantity** (the **Order qty** column) is what the line cap buys: the line cap ÷ the landed cost, rounded down, and at least 1. The line cap is the profile's budget × **Max first order per line** (£1,000 × 30% = £300 in Test order). If the MOQ is more than that, the order is the MOQ and it's flagged "(MOQ)". With no MOQ on the line, the supplier's minimum order value sets it: a £150 minimum with £5 items means 30 units.
- It's shown as, e.g., "2.5 months", "under a week" (below a quarter of a month) or "never at your share" (a share of 0).

The [Demand gate](/help/gates/demand) fails a row over **Max months to sell the order** (default 3), e.g. "40 units at 5/mo = 8 months, over 3". The why-line of a scored row ends "First order 30 units sells in 2.5 months."

## Dormant

A listing that exists and has Keepa history, but that nobody is selling now: no current Buy Box, no current sales rank, no current offers, and no offer live in the history today.

A dormant row is judged on its past year instead of today:

- **Price:** the last Buy Box price in the past 12 months, e.g. "last seen £12.99 on 3 Mar 2026".
- **Demand:** the past 12 months' rank drops ÷ 12 as sales a month, and the 12-month average rank. With no rank drops in 12 months, the [Demand gate](/help/gates/demand) fails it: "dormant: no sales history (no rank drops in 12 months)".
- **Competition:** the [Competition shape](/help/gates/competition) gate is skipped ("dormant: no sellers now, none for 120 days"), and your share isn't divided by anyone.

The why-line starts "Dormant: no seller for 120 days; priced on the last seen £12.99 on 3 Mar 2026." The row details show **Days without a seller**.

## Mirage

A borrowed rank: a listing whose sales rank or reviews probably belong to another product, often after a merge or a new variation joining an old family. The [Borrowed rank (mirage)](/help/gates/mirage) gate flags it when any of these is true:

- the Keepa history is under **Min rank history** days old (default 90), e.g. "rank history is 41 days old";
- the review count jumped more than **Max one-day review jump** (default 50%) between two readings no more than 1.5 days apart;
- the listing is a variation child first seen more than 30 days after its parent.

The detail reads, e.g., "Borrowed rank: reviews jumped 180% in a day". The gate warns by default. A warning also sets the Risk group's **Mirage flag** in the [score](/help/concepts/score), and the why-line lists "borrowed rank".

## Spike

The current Buy Box is well above normal while sellers leave. Both must hold: the Buy Box is more than **Spike tolerance over median** (default 15%) above its 12-month median, and there are fewer offers now than 90 days ago.

The [Price regime](/help/gates/priceRegime) gate then says, e.g., "SPIKE: Buy Box £18.99 is 27% over the £14.99 median with offers falling; scored on the median". Whatever the profile's scoring price rule, the row is priced at the 12-month median, and the price source reads "12-month median (spike)". The gate warns by default. With the gate off, the median switch doesn't happen either.

## Erosion

A Buy Box that has been falling steadily over the year. The slope is a straight-line fit through the daily Buy Box prices over 12 months, as a % of the median per year. It needs at least 60 daily prices spanning 90 days or more.

When the fall is steeper than **Max Buy Box decline** (default 20% a year), the [Price drift](/help/gates/priceDrift) gate says "EROSION: Buy Box falling 26% a year". It warns by default. The same slope is the **12-month Buy Box slope** parameter in the Price health group of the [score](/help/concepts/score).

## Waiver

Your decision to let one product through one gate. Waiving turns that gate's fail into a warning with "(waived by you: <your reason>)" after the detail. Because the row no longer stops there, the later gates, fees and score all run. A waived gate counts towards the Risk group's **Other warn-mode gates tripped**, and the why-line shows it under "Watch".

A waiver belongs to the product (its EAN and ASIN) and the gate, not to a run, so it applies in every run. It takes effect the next time the product is screened or re-screened. You waive a gate from a failed gate in the row's details. All waivers are listed in [Settings](/help/pages/settings) → **Waived**, where you can remove them. See [Waive a gate](/help/howto/waive-a-gate).

## Doubtful match

When an EAN leads to more than one Amazon listing, a listing that's clearly a different product. It is doubtful if:

- Amazon's brand and the sheet's brand don't match, and Amazon's title doesn't name the sheet's brand either: "Amazon lists this as Nivea, the sheet says Dove"; or
- apart from the brand, the two titles (at least two words each) share no word. Words match when they're the same or share their first five letters: "Amazon's title "…" shares nothing with the sheet's "…"".

The [Match quality](/help/gates/matchQuality) gate fails a doubtful match ("Doubtful match: …") whatever its mode, unless the gate is off. The other listings on the same EAN are still screened. If you know it's right, you can [waive](#waiver) it.

## Multipack

A listing that sells several of the supplier's items as one unit. The app reads the pack size from the title: "Pack of 3", "3-pack", "3 x 200ml", "200ml x 3", "12 x …" at the start, "Twin pack", "Duo", "Triple" and so on. Only 2 to 24 counts; bigger numbers are pieces inside one item ("100 pack" cotton pads). The supplier's row is read the same way, and anything that doesn't say is a single.

When the listing and the supplier's item differ, the unit cost is scaled by listing ÷ supplier. A 3-pack listing from single items costs 3 of them. The MOQ is divided by the same ratio and rounded up. Prep and inbound are counted once per listing. The row details say, e.g., "Listing is a 3-pack: costs are for 3 of the supplier's items per listing."

Amazon's pack attributes don't change the cost on their own. When they disagree with the title, [Match quality](/help/gates/matchQuality) warns "pack mismatch, check: title says 3, Amazon's attributes say 1". When the title is silent but both attributes say the same multipack, it warns "pack mismatch, check: title doesn't say, Amazon's attributes say 6". The why-line lists the warning under "Watch".

## Scoring price

The sell price used for fees, profit, the price band and the score. The profile chooses it under **Score on**: **Lower of current Buy Box and 12-month median** (default), **Current Buy Box** or **12-month median**. When one of the two is missing, the other is used, e.g. "current Buy Box (no history)". A [spike](#spike) switches to the median, and a [dormant](#dormant) listing uses its last Buy Box. The row details show which price was used after "Price:".

## Landed cost

What one unit costs you once it's at Amazon: the supplier's price ex-VAT in £, plus import duty, plus VAT on both if you're not VAT registered, plus **Inbound to FBA** (£0.30) and **Prep, bag and label** (£0.15). See [Fee engine](/help/concepts/fees#landed-cost).

## Line cap

The most a first order for one product may cost: the profile's budget × **Max first order per line**. It's £300 in Test order (30% of £1,000) and £1,000 in the other shipped profiles. The [Budget fit](/help/gates/budgetFit) gate fails a line whose MOQ costs more.
