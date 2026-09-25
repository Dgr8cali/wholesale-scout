---
title: Import a DG report
summary: Export a run's ASINs, look them up in Seller Central's Dangerous Goods lookup, and import the file it returns so the Compliance gate uses Amazon's answer.
synonyms: [dangerous goods, hazmat, dg report, hazmat report, dg lookup, hazmat lookup, sds, upload dg, classification, export asins]
order: 5
---
Seller Central's Dangerous Goods lookup tells you, per ASIN, whether Amazon treats a product as dangerous goods (DG) and whether it can store it. Import the file it returns and the [Compliance category](/help/gates/compliance) gate uses that answer ahead of the catalogue's DG attributes and any keyword.

## Steps

1. On [Runs](/help/pages/runs), open the run's **⋯** menu and choose **Export ASINs for DG lookup**. You get a one-column CSV headed **ASIN**, each ASIN once.
2. In Seller Central, open the Dangerous Goods lookup and look those ASINs up (paste them or upload the file, whichever the page offers). Download the result.
3. Back on Runs, choose **Import DG report…**:
   - from the run's **⋯** menu: the statuses are saved and that run is re-screened straight away;
   - from the **⋯** at the top of the page: the statuses are saved; re-screen the runs you want afterwards.
4. Pick the file (xlsx, xls, csv or txt). A message says how many ASINs were saved, by status, how many aren't products in the app, and which columns were read.

## What the file needs

A header row with a column called **ASIN** (or Child ASIN / Product ASIN) within the first 20 rows, and a status column. The status column is found by its name: one mentioning dangerous goods, hazmat, DG or classification is preferred, else one called status or result. A column named program, programme, storage type or fulfilment program is kept as the programme. If the workbook has several sheets, the first with an ASIN header is read. Rows without a real ASIN are skipped.

## How Amazon's wording is read

| Amazon's words (examples) | Saved as | What the Compliance gate does |
|---|---|---|
| "Not dangerous goods", "Non-DG", "Not hazmat" | not dangerous goods | Clears any DG match from the catalogue's attributes or keywords (flammable liquid, aerosol, battery, chemical). The line starts "Amazon DG lookup: not dangerous goods". Other rules (cosmetic, food, IP risk…) still apply. |
| "Dangerous goods", "Hazmat", "DG – fulfillable" | dangerous goods, fulfillable | Replaces the catalogue's and keywords' DG match: "Amazon DG lookup: dangerous goods, fulfillable (FBA) → Aerosol". It counts under the DG rule that matched (Chemical if none did), with that rule's mode. |
| "Under review", "More information needed", "Upload SDS" | review required | As above: "Amazon DG lookup: review required → …", under that rule's mode. |
| "Not eligible", "Cannot be fulfilled", "Prohibited" | dangerous goods, not fulfillable | Fails the gate (when the gate is on fail) whatever the rule's own mode, even off. |
| Anything else | not recognised | Saved with Amazon's words and shown first on the line ("Amazon DG lookup: “…”"), but it changes nothing: the attributes and keywords decide as before. The import message lists these wordings. |

The programme is shown in brackets after the status. A new import for an ASIN replaces its earlier one. The status is kept on the product, so every run that has the product uses it the next time it's screened or re-screened.

## Other ways DG data gets in

## Amazon's catalogue attributes, automatically

When a product is matched on Amazon (SP-API catalogue), the app reads the listing's dangerous-goods attributes: the UN number, proper shipping name and transport class, GHS classes, and the heat-sensitive flag. The [Compliance category](/help/gates/compliance) gate checks this before any keyword:

| Amazon says | Rule it triggers |
|---|---|
| UN1950, "aerosol", class 2, or a GHS gas class | Aerosol |
| UN3480, UN3481, UN3090, UN3091, or "lithium" / "batter…" | Battery |
| Class 3, UN1266 and similar, "flammable" / "perfum…" / "alcohol", or GHS flammable | Hazmat: flammable liquid |
| Any other regulated entry or GHS hazard | Chemical |
| Heat-sensitive | Meltable |

The why-line reads, for example, "Aerosol (Amazon marks this as hazmat: UN1950, Aerosols, class 2.1)". You don't need to do anything for this.

## Seller Central's classification, one product at a time

For a product Amazon has classified in Seller Central, the [Chrome extension](/help/pages/extension) can read the classification from the page and save it to the product. Click **Look up** in the extension's product panel, confirm **Hazmat**, **Not hazmat** or **Unknown** on the bar in Seller Central, and click **Save to the app**. Hazmat then counts in the compliance gate the next time the product is screened. See [Add a zero-quantity offer for DG review](/help/howto/zero-quantity-offer-for-dg-review) for the full steps.

## Your own compliance rules

If a report tells you a whole kind of product is dangerous goods, add or edit a rule on [Settings](/help/pages/settings) → **Gates** → **Compliance rules**: add keywords (or a `/pattern/`) and Amazon categories, write the checklist, and click **Save rules**. Then set the rule's mode in each profile (off, warn or fail). Rules are shared by every profile and run on the row's own text before any API call.

## For one product you've cleared

If a report shows a product is fine but a keyword still flags it, [waive the gate](/help/howto/waive-a-gate) for that product with a reason such as "not DG per Amazon report".
