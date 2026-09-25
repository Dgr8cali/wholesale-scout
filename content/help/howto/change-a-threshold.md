---
title: Change a threshold
summary: Change a gate's limit or mode in a profile, save it, and re-screen a run to apply it.
synonyms: [limit, setting, min roi, min profit, price band, gate mode, strictness, re-screen]
order: 1
---
Every gate limit (the price band, minimum profit, maximum sellers and so on) lives in a [profile](/help/concepts/profiles). You change it on the [Settings](/help/pages/settings) page, then re-screen a run to see the effect.

## Change the number

1. Open **Settings**. The **Gates** tab opens first.
2. In the bar at the top, pick the profile under **Editing**. The default is marked "(default)"; the app ships with **First order** as the default.
3. Find the gate's card. Gates are listed in the order they run, numbered 1 to 12.
4. Type the new value. For example, on **Fee engine** change **Min ROI (%)** from 20 to 25, or on **Price band** change **Min sell price (£)** from £12 to £10.
5. The bar now shows **Unsaved changes**. Click **Save**.

If you empty a field and save, you get "These settings need a number: …". Put a value back.

To try a change without touching the profile you use every day, open the **Profiles** tab and click **Save as new profile** instead of **Save**, or **Duplicate** a profile first and edit the copy.

## Change how strict a gate is

Each gate card has a mode selector:

- **fail** drops the row at that gate and records why. Later gates don't run.
- **warn** keeps the row, notes the problem and lowers the Risk group of the [score](/help/concepts/score).
- **off** skips the gate.

Some gates have extra modes:

- **Gating and blocks**: **Approval needed counts as** sets what "approval needed" does on its own (warn by default). A block always uses the gate's own mode. See [Gating](/help/gates/gating).
- **Compliance category**: each rule (Liquid, Aerosol, IP-risk brand and so on) has its own off / warn / fail. A rule only drops a row when both the rule and the gate are on fail. **Flag liquids only above … ml** ignores small bottles; leave it empty to flag every liquid. See [Compliance](/help/gates/compliance).

## Other numbers that act like thresholds

| Where | Setting | Default |
|---|---|---|
| Score tab | **Green (order a test) from** / **Amber (needs one thing to move) from** | 75 / 55 |
| Score tab | **Score on** (which sell price is used) | Lower of current Buy Box and 12-month median |
| Fees tab | VAT, fees per unit, storage months, returns | see [Settings](/help/pages/settings) |
| Profiles tab | **Budget (£)** | £1,000 |
| Profiles tab | **Keepa history max age (days)** | 7 |

The Budget works with **Max first order per line (% of budget)** on the [Budget fit](/help/gates/budgetFit) gate: with £1,000 and 25% (First order's setting), no single line may cost more than £250 for its first order.

## Apply it to a run

Saving doesn't change runs already screened: each run keeps its own copy of the profile. To apply your change:

1. Open the run on the [Runs](/help/pages/runs) page.
2. In the selector next to **Re-screen**, keep "(as saved now)" for the run's own profile, or pick another profile.
3. Click **Re-screen**. Gates and the score run again on the data already fetched: no re-upload and no new Keepa tokens for data it already has.

New uploads and checks use whichever profile you choose when you start them.
