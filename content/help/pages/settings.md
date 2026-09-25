---
title: Settings
summary: Screening profiles (gates, score, fees), the shared compliance rules and rate card, waived gates, the IP-risk list and saved filter sets.
synonyms: [profile, thresholds, gate modes, rate card, compliance rules, ip risk, waivers, filter sets]
route: /settings
order: 12
---
Settings is where you decide how products are screened: which gates run and how strict they are, how the 0–100 score is built, and how fees and landed cost are worked out. It also holds the lists shared by every profile: compliance rules, the rate card, your waivers and your IP-risk brands.

The page has seven tabs: **Gates**, **Score**, **Fees**, **Profiles**, **Waived**, **IP risk** and **Filter sets**. You can open a tab directly with `?tab=`, for example `/settings?tab=ip` (the Brands page links there).

## The profile bar

On the **Gates**, **Score**, **Fees** and **Profiles** tabs a bar sits at the top. Those four tabs all edit one [profile](/help/concepts/profiles) at a time.

| Control | What it does |
|---|---|
| **Editing** | Picks the profile you are editing. The default profile is marked "(default)". If you have unsaved changes you are asked **Discard unsaved changes?** first. |
| **Unsaved changes** / **Saved** | Shows whether the draft differs from what is stored. |
| **Score weights total N, not 100** | Appears in red when the group weights on the Score tab don't add up to 100. You can't save until they do. |
| **Discard** | Throws away your edits and reloads the stored profile. Only shown when there are changes. |
| **Save as new profile** | Only on the Profiles tab. Asks for a name and saves the current draft as a new profile, leaving the original untouched. |
| **Save** | Saves the draft over the profile you are editing. |

Changes don't touch runs already screened. A run keeps its own copy of the profile it was screened with; re-screen the run on the [Runs](/help/pages/runs) page to apply new settings.

If a number field is left empty, saving fails with "These settings need a number: …" naming the field.

## Gates tab

### Gates

"Run in this order. Fail drops the row and records why; warn keeps it and lowers the Risk group; off skips the gate."

Each of the twelve gates has a card with its number, name, what data it **Needs** (Row, Keepa, SP-API and so on), a mode selector (**off**, **warn**, **fail**) and its numeric settings. The defaults below are the app's base defaults; the four shipped profiles differ in a few places (see [Profiles](/help/concepts/profiles)).

| # | Gate | Settings (default) |
|---|---|---|
| 1 | [Price band](/help/gates/priceBand) (fail) | **Min sell price (£)** £12, **Max sell price (£)** £40 |
| 2 | [Compliance category](/help/gates/compliance) (warn) | **Flag liquids only above … ml** (empty flags every liquid), and a mode for each compliance rule |
| 3 | [Budget fit](/help/gates/budgetFit) (fail) | **Max first order per line (% of budget)** 100 |
| 4 | [Match quality](/help/gates/matchQuality) (fail) | none |
| 5 | [Borrowed rank (mirage)](/help/gates/mirage) (warn) | **Min rank history (days)** 90, **Max one-day review jump (%)** 50 |
| 6 | [Amazon presence](/help/gates/amazonPresence) (fail) | **Amazon held an offer in the last (days)** 365 |
| 7 | [Competition shape](/help/gates/competition) (warn) | **Min FBA sellers** 3, **Max FBA sellers** 12, **Max top-seller Buy Box share (%)** 70 |
| 8 | [Demand](/help/gates/demand) (fail) | **Min sales / month (total)** 30, **Min your share (sales / month)** 5, **Max 90-day average rank** 50,000, **Max months to sell the order** 3 |
| 9 | [Price regime](/help/gates/priceRegime) (warn) | **Spike tolerance over median (%)** 15 |
| 10 | [Price drift](/help/gates/priceDrift) (warn) | **Max Buy Box decline (% / year)** 20 |
| 11 | [Gating and blocks](/help/gates/gating) (fail) | **Approval needed counts as** warn. "Blocked always uses the gate's mode" |
| 12 | [Fee engine](/help/gates/fees) (fail) | **Min profit / unit (£)** £2, **Min ROI (%)** 20, **Min margin (%)** 15 |

On the Compliance card, every rule gets its own off / warn / fail selector (default warn). A rule set to fail only drops the row when the gate itself is also on fail. The **IP-risk brand** rule on fail drops only high-risk brands; medium and low still warn.

To change one of these, see [Change a threshold](/help/howto/change-a-threshold).

### Compliance rules

"Shared by every profile; each profile sets each rule to off, warn or fail above." These rules run on the row's own text before any API call. Amazon's own dangerous-goods data, when the product has it, is checked first.

Each rule has:

| Field | What it's for |
|---|---|
| **Name** | Shown in the gate's why-line, e.g. "Hazmat: flammable liquid". |
| **Key** | Short id (letters, digits, `_`). Profiles store each rule's mode by this key. |
| **Why it exists** | A note explaining the rule. |
| **Amazon categories (one per line)** | A product in one of these Amazon categories matches even without a keyword. |
| **Keywords (comma or new line)** | Whole words or phrases, case-insensitive. Write `/pattern/` for a regular expression. |
| **Checklist it triggers (one per line)** | What to sort out before selling, e.g. "Safety data sheet (SDS) from supplier". |

**+ Add rule** adds a blank rule; **Remove rule** deletes one. Nothing is stored until you click **Save rules**. The shipped rules are Hazmat: flammable liquid, Liquid, Aerosol, Cosmetic, Supplement, Food, Electrical, Battery, Under-3s toy, Chemical, Meltable and IP-risk brand. Meltable and IP-risk brand have no keywords: Meltable comes from Amazon's heat-sensitive flag and IP-risk brand from your list on the **IP risk** tab.

## Score tab

How the [score](/help/concepts/score) is built.

- **Scoring price**, **Score on**: the sell price used for fees, profit and the score. **Lower of current Buy Box and 12-month median** (default), **Current Buy Box**, or **12-month median**.
- **Score weights**: a slider and number for each group: Demand 25, Competition 20, Price health 15, Margin 25, Risk 10, Fit 5. They must total 100; the running total shows as **Total N / 100**.
- **Green (order a test) from** (default 75) and **Amber (needs one thing to move) from** (default 55): the score bands.
- **Score scales**: every parameter inside a group maps a value to 0–100 along a set of points, with straight lines between them and flat beyond the ends. Each point is a value and a score; **+ point** adds one, **×** removes one (a scale keeps at least two). **weight** sets the parameter's pull inside its group; 0 leaves it out. For example, Net profit per unit scores £0 → 0, £2 → 30, £5 → 80, £8 → 100.

## Fees tab

### Fees and landed cost

"How this profile turns a supplier price into a landed cost and Amazon's fees into profit." See [Fees](/help/concepts/fees).

| Control | Default |
|---|---|
| **VAT registered** (reclaim VAT on fees and stock; pay output VAT on sales) | off |
| **VAT rate (%)** | 20 |
| **Digital services fee (%)** | 2 |
| **Inbound to FBA (£/unit)** | £0.30 |
| **Prep, bag and label (£/unit)** | £0.15 |
| **Import duty (% of cost)** | 0 |
| **Average months in storage** | 2 |
| **Returns allowance (% of sale)** | 2 |
| **Storage and peak rates** | **By date (Oct–Dec is peak)**; or **Always standard**, **Always peak** |
| **No dimensions: assume tier** | Small parcel |
| **No dimensions: assume weight (g)** | 400 |

The last two are used when Amazon gives no dimensions or weight for a product.

### Rate card

Shared by every profile. It holds Amazon's size tiers, FBA fees, storage and referral rates as JSON. Fee amounts are GBP ex-VAT and ex-DSF. The table lists every saved card with **Effective** and **Saved** dates; the one in use is marked **active**. **Load into editor** puts an older card in the text box. Edit the JSON and click **Save as new version**: it's saved as a new card and made active, and the old one is kept for comparison. Invalid JSON is refused with "Not valid JSON: …"; a card missing fields is refused with "Rate card is missing or has a bad …".

## Profiles tab

- **Profiles** table: each profile's name, **Budget**, and **Rename**, **Duplicate**, **Make default** and delete. The default profile can't be deleted ("Set another profile as default first"). Deleting asks first; past runs keep their own copy of its settings. The app ships with **First order** (the default), **Strict**, **Test order** and **Dry goods only**.
- **Budget (£)**: the first order across a run; default £1,000. The budget-fit gate keeps any one line within its share.
- **Keepa history max age (days)**: default 7. A Keepa snapshot fetched by any run within this many days is reused instead of fetching again, so it costs no [tokens](/help/concepts/keepa-tokens).
- **Seller profiles**: **Look up seller profiles** (on by default) looks up the top Buy Box sellers on Keepa for rows that pass every gate (1 token each, reused for 7 days). **Sellers per row** (3) and **Distributor when brand is at least (% of storefront)** (50) flag a likely brand distributor.

## Waived tab

"A waived gate turns that product's fail into a warning in every run, so later gates, fees and the score still run." The table lists each [waiver](/help/reference/glossary#waiver): the product (EAN, and ASIN or "any ASIN"), the gate, your reason and the date. **Remove** deletes it; that applies the next time a run is screened or re-screened. You add waivers from a result's details, not here. See [Waive a gate](/help/howto/waive-a-gate).

## IP risk tab

**IP-risk brands** are brands known to file IP or counterfeit complaints against resellers. A product whose brand (or an alias) is on the list gets the compliance rule **IP-risk brand**: a warning by default. Set that rule to fail on the Gates tab to drop high-risk brands. On the [Brands](/help/pages/brands) page, high risk halves the wholesale-friendly score.

- The add row takes **Brand**, a level (**high**, **medium**, **low**), aliases separated by `;`, a note, a source and a date, then **Add**.
- **Find a brand** searches names and aliases. **Unverified only** shows entries from the starter list, marked "seed, unverified" with a **?**: check them before relying on them.
- Every cell in the table can be edited in place; the bin icon removes a brand.
- **Import a list**: paste a CSV with a header naming `brand`, `level`, `note`, `source`, `date`, `aliases` in any order, or just one brand per line. A missing level is medium. **Source for rows without one** fills blank sources. **Import N** adds new brands and updates listed ones (blank cells keep what's there).

## Filter sets tab

Filter sets are saved from a run's filter bar with **Save current filters…** and applied from **Saved filters** on any run or on [Favourites](/help/pages/favourites). This tab lists them with their filters as chips; the bin icon deletes one for every run.
