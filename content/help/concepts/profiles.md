---
title: Profiles
summary: What a screening profile holds, the four profiles the app ships with, and how to copy, switch and re-screen with one.
synonyms: [screening profile, first order, test order, strict, dry goods only, default profile, settings, preset]
order: 3
---
A profile is one complete set of screening settings. It decides which gates run and how strictly, how rows are scored, and how fees and landed cost are worked out. You pick a profile each time you start a run, so you can screen the same list more strictly or more loosely without changing your settings back and forth.

## What's in a profile

| Part | Where you edit it | What it holds |
|---|---|---|
| Gates | [Settings](/help/pages/settings) → **Gates** | Each gate's mode (off, warn or fail) and its thresholds. Compliance has a mode per rule, and gating has **Approval needed counts as** |
| Scoring price | **Score** → **Score on** | Which price fees, profit and the score use. Default **Lower of current Buy Box and 12-month median** |
| Score | **Score** | Group weights, green and amber bands, and every parameter's scale. See [Score](/help/concepts/score) |
| Fees | **Fees** → **Fees and landed cost** | VAT registration, VAT rate, DSF, inbound, prep, duty, storage months, returns and the missing-size assumptions. See [Fee engine](/help/concepts/fees) |
| Budget | **Profiles** → **Budget** | The money for a first order across a run (default £1,000). The [Budget fit](/help/gates/budgetFit) gate caps each line at a share of it |
| Keepa history max age | **Profiles** → **Keepa history** | Reuse a Keepa snapshot up to this many days old (default 7). See [Keepa tokens](/help/concepts/keepa-tokens) |
| Seller profiles | **Profiles** → **Seller profiles** | **Look up seller profiles** (on), **Sellers per row** (3) and **Distributor when brand is at least** (50% of storefront) |

Some things are shared by every profile, not kept in one: the rate card (**Fees** → **Rate card**), the compliance rule keywords (**Gates**), waived gates, the IP-risk list and saved filter sets.

## The profiles the app ships with

When there are no profiles yet, the app creates four: **First order** (the default), **Strict**, **Test order** and **Dry goods only**. Each starts from the same defaults (listed at the end of this section) and changes a few things. Profiles you already have aren't changed or added to.

Don't confuse the **First order** profile with a row's first order: the quantity one line's share of the budget buys, shown as **Order qty** and used for [months to sell](/help/reference/glossary#months-to-sell).

### First order (default)

Compared with the defaults, First order takes smaller lines, a lower price ceiling and fewer sellers, has a lower demand bar but wants a bigger share for you, and has higher profit and ROI floors with a lower margin floor:

| Gate | Setting | First order | Default |
|---|---|---|---|
| [Price band](/help/gates/priceBand) | **Max sell price (£)** | £35 | £40 |
| [Compliance category](/help/gates/compliance) | Gate mode | fail | warn |
| | Rules on fail | Hazmat: flammable liquid, Aerosol, Supplement, Food, Under-3s toy | none |
| | Other rules (Liquid included) | warn | warn |
| | **Flag liquids only above** (ml) | 500 | empty (every liquid) |
| [Budget fit](/help/gates/budgetFit) | **Max first order per line (% of budget)** | 25% (£250 of £1,000) | 100% |
| [Amazon presence](/help/gates/amazonPresence) | **Amazon held an offer in the last (days)** | 180 | 365 |
| [Competition shape](/help/gates/competition) | **Min FBA sellers** / **Max FBA sellers** | 2 / 8 | 3 / 12 |
| | **Max top-seller Buy Box share (%)** | 60 | 70 |
| [Demand](/help/gates/demand) | **Min sales / month (total)** | 10 | 30 |
| | **Min your share (sales / month)** | 8 | 5 |
| | **Max 90-day average rank** | 100,000 | 50,000 |
| [Fee engine](/help/gates/fees) | **Min profit / unit (£)** | £2.50 | £2.00 |
| | **Min ROI (%)** | 25 | 20 |
| | **Min margin (%)** | 12 | 15 |

Everything else is the default: the modes of every gate except Compliance, **Min sell price (£)** £12, **Max months to sell the order** 3, the other gates' thresholds, the £1,000 budget, the score and the fees.

With **Flag liquids only above** at 500 ml, the Liquid rule only flags a liquid whose largest volume in the text is over 500 ml, e.g. "Liquid (750 ml, over 500 ml)". A liquid with no volume in its text isn't flagged by that rule. Since Liquid only warns here, a large liquid stays in the list, flagged.

### Test order

For a small test order spread over several products:

- **Budget fit**: **Max first order per line** is 30% of the budget, so no line can take more than £300 of the £1,000 budget. A line whose MOQ costs more than that fails. Strict and Dry goods only allow 100%.
- **Compliance**: the gate and every rule warn, so fragrances, liquids, batteries and so on stay in the list, flagged, rather than dropped.
- **Fee engine floors**: £2 profit, 20% ROI, 15% margin (the defaults).

The seeded profiles carry no notes of their own beyond these settings.

### Strict

For when you only want clean, well-margined products:

- **Compliance**: the gate and every rule fail, so any compliance match drops the row. For an IP-risk brand, only a high-risk brand fails; medium and low only warn.
- **Amazon presence**: fail if Amazon has sold in the last 365 days (the same as the default).
- **Fee engine floors**: 25% ROI and 18% margin, up from 20% and 15%. Min profit stays £2.
- **Budget fit**: 100% per line.

### Dry goods only

For avoiding hazmat and liquids:

- **Compliance**: the gate fails. Fragrance, liquid, aerosol, cosmetic, supplement and chemical fail. The other rules (food, electrical, battery, under-3s toy, meltable and IP risk) only warn.
- Everything else is the default, with 100% per line.

### The defaults all four start from

| Gate | Mode | Thresholds |
|---|---|---|
| [Price band](/help/gates/priceBand) | fail | £12 to £40 |
| [Compliance category](/help/gates/compliance) | warn | every rule warn |
| [Budget fit](/help/gates/budgetFit) | fail | 100% of budget per line |
| [Match quality](/help/gates/matchQuality) | fail | |
| [Borrowed rank (mirage)](/help/gates/mirage) | warn | 90 days of history, 50% one-day review jump |
| [Amazon presence](/help/gates/amazonPresence) | fail | 365 days |
| [Competition shape](/help/gates/competition) | warn | 3 to 12 FBA sellers, top seller 70% of the Buy Box |
| [Demand](/help/gates/demand) | fail | 30 sales a month, your share 5 a month, 90-day average rank 50,000, 3 months to sell |
| [Price regime](/help/gates/priceRegime) | warn | 15% spike tolerance |
| [Price drift](/help/gates/priceDrift) | warn | 20% a year decline |
| [Gating and blocks](/help/gates/gating) | fail | approval needed: warn |
| [Fee engine](/help/gates/fees) | fail | £2 profit, 20% ROI, 15% margin |

Budget £1,000, scoring price the lower of current Buy Box and 12-month median, Keepa history max age 7 days, seller lookup on for the top 3 sellers.

## Editing a profile

On the **Gates**, **Score**, **Fees** and **Profiles** tabs of [Settings](/help/pages/settings), a bar at the top shows which profile you're changing:

| Control | What it does |
|---|---|
| **Editing** | Chooses the profile to edit. If you have unsaved changes, you're asked "Discard unsaved changes?" first |
| **Unsaved changes** / **Saved** | Whether the profile on screen matches the saved one |
| **Discard** | Throws away your changes |
| **Save** | Saves the changes into this profile. Disabled while the score weights don't total 100 |
| **Save as new profile** | On the **Profiles** tab only: saves what's on screen as a new profile with a name you give, and leaves the original as it was |

## Copying, renaming and the default

The **Profiles** tab lists every profile with its budget:

| Action | What it does |
|---|---|
| Click the name | Edit that profile |
| **Rename** | Give it a new name. Names must be unique |
| **Duplicate** | Copy it under a new name (suggested: "First order copy" for First order). Use this to try a change without touching the original |
| **Make default** | The default is preselected on [Upload](/help/pages/upload), [Qogita](/help/pages/qogita) and [Check](/help/pages/check) |
| Delete (bin icon) | Removes the profile. "Past runs keep their own copy of its settings." You can't delete the default |

Profiles saved by an older version of the app are filled in with the defaults for any setting they don't have.

## A run's profile

When you start a run, the **Profile** you choose on Upload, Qogita or Check is copied into the run. The run keeps that copy. Changing the profile later doesn't change runs already made. The run page's header shows which profile it used and when, e.g. "First order (version saved 12 Sept, 09:30; applied 14 Sept, 16:05)".

## Re-screening with another profile

To apply changed settings, or a different profile, to a run you've already screened:

1. Open the run.
2. In the profile list next to **Re-screen**, choose "<this run's profile> (as saved now)" to use its current settings, or pick another profile.
3. Press **Re-screen**.

Every gate and the score run again from the data already fetched. The run switches to that profile. Most rows need no new Amazon or Keepa calls. A row that now needs data it never fetched is looked up again: for example, one that failed an early gate before and now passes it, or one that needs Keepa history. The message says how many, e.g. "Re-screening with Strict as saved now: 812 rows done; 14 need data they never fetched and are being looked up now." Those lookups can spend [Keepa tokens](/help/concepts/keepa-tokens).

See [Runs](/help/pages/runs) and [Change a threshold](/help/howto/change-a-threshold).
