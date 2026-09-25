---
title: Match quality
summary: Checks that the supplier's EAN found the right Amazon UK listing, and flags doubtful, multi-ASIN and pack mismatches.
synonyms: [ean, asin, barcode, no match, doubtful match, multi asin, pack mismatch, catalog lookup]
gate: matchQuality
order: 4
---
Match quality makes sure you're looking at the right Amazon listing before anything else is judged on it. Every other number (price, sales, fees) comes from the listing the EAN matched.

## What it checks

1. **No listing**: the EAN didn't resolve to any Amazon UK listing (the SP-API catalog is searched, then Keepa).
2. **Doubtful match**: when one EAN maps to several ASINs, each listing is compared with the sheet line. It's doubtful when Amazon's brand clearly differs from the sheet's (and the title doesn't name the sheet's brand either), or when the titles share no words at all. This is conservative: different wording alone isn't enough.
3. **Several ASINs**: the EAN maps to more than one listing. Each is screened as its own row.
4. **Pack mismatch**: the listing's title and Amazon's pack attributes disagree about how many units it is (see [multipack](/help/reference/glossary#multipack)).

A doubtful match always fails, whatever the gate's mode, unless the gate is **off**. Several ASINs and a pack mismatch only ever warn.

## When it runs

**After the catalog lookup** (SP-API, then Keepa for EANs the catalog didn't find), before any Keepa history is fetched. A row with no listing stops here. **Fetch anyway** doesn't carry on past a missing listing: there's nothing to fetch.

## Settings

Settings, **Gates** tab, card **4 Match quality** (Needs: Keepa / catalog). It has no numbers to set, only the mode.

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | **fail** drops rows with no listing; **warn** keeps them, flagged; **off** skips the gate, including the doubtful-match check. |

## Mode in each profile

| Profile | Mode |
|---|---|
| Strict | fail |
| Test order (default) | fail |
| Dry goods only | fail |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| fail / warn | EAN didn't resolve to an Amazon UK listing: search miss: tried EAN 3264680023323; Amazon returned no items | No listing. The note after the colon says what was tried. The result's details also show a **Catalog lookup** section with each attempt. |
| fail | Doubtful match: Amazon lists this as Garnier, the sheet says L'Oreal | Brands clash. Tagged DOUBTFUL_MATCH. |
| fail | Doubtful match: Amazon's title "Phone case for iPhone 15" shares nothing with the sheet's "Micellar Water 400ml" | Titles have nothing in common. |
| warn | EAN maps to 3 ASINs; each is scored | Several listings share the EAN. Tagged MULTI_ASIN. |
| warn | pack mismatch, check: title says 3, Amazon's attributes say 1 | Title and attributes disagree. Also "title doesn't say, Amazon's attributes say 6". Tagged PACK_MISMATCH. |
| pass | Matched B0C1234XYZ | One listing, no doubts. |
| skipped | Not looked up yet | The lookup hasn't happened. |
| off | Gate off in this profile | |

See also [doubtful match](/help/reference/glossary#doubtful-match).

## What to do about a fail

- **No listing**: check the EAN on the sheet (a missing leading zero is common). If the product isn't on Amazon UK, there's nothing to sell against.
- **Doubtful match**: open the listing from the result and compare. If it really is the same product, [waive the gate](/help/howto/waive-a-gate) for it; the other ASINs of the EAN are screened separately.
- **Pack mismatch**: check how many units the listing sells. The cost is scaled by the title's count, so if the title is wrong the profit is too.
