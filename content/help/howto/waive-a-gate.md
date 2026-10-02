---
title: Waive a gate
summary: Accept a failed gate or a warning for one product, in every run.
synonyms: [waiver, override, accept, ignore gate, un-waive, exception]
order: 2
workspace: wholesale
---
A [waiver](/help/reference/glossary#waiver) tells the app you accept a gate's result for one product:

- **A fail** becomes a warning, so the row carries on through the later gates, fees and the [score](/help/concepts/score).
- **A warning** becomes a pass, so it no longer counts against the row: if nothing else warns, the row goes green.

Use it when you know better than the gate, for example you already hold the paperwork a compliance rule asks for, or you're happy with the seller count.

## Waive one product

1. Open a run on the [Runs](/help/pages/runs) page (or [Favourites](/help/pages/favourites)) and open a row's details.
2. In the gates list, a failed or warning gate has a **Waive** link next to its why-line.
3. Click **Waive**. A box appears: type a reason if you like (**Reason (optional)**, up to 300 characters), then press Enter or click **Waive**. **Cancel** backs out.

On a run, that product's rows in the run are re-screened straight away. If the later gates need data that was never fetched (the row stopped early, before Keepa or Amazon were asked), the app fetches it in the background and says "… waived; fetching the data later gates need for this product." That can spend [Keepa tokens](/help/concepts/keepa-tokens).

Wherever you waive it from (a run, Favourites or the product page), the product's rows in every other current run are re-scored straight away from stored data ("… waived; re-scored in every current run"). Brands, Suppliers and the order planner catch up a moment later.

## Waive many at once

Select rows with their tick boxes. In the bar that appears, choose the gate in **Gate to waive or un-waive**, add a reason if you like, and click **Waive**. It covers that gate whether it failed or warned on each row. **Un-waive** removes that gate's waiver from the selected products.

## What a waiver does

- It applies to the product in **every** run, now and later, not just this one. It is stored by EAN and ASIN.
- The gate still runs. If it fails, it's recorded as a warning with your reason on the end, for example: "Sells at £10.50, under the £12.00 floor (waived by you: bundle sells higher)". If it warns, it's recorded as a pass with the same note: "Medical device (keyword match: eczema): needs UKCA/CE marking… (waived by you: CE marked, approved)".
- The row gets a **waived** badge in the results table.
- A waived fail counts as a warning in the Risk group, so the score is a little lower than if the gate had passed. A waived warning counts as a pass.
- If the gate passes, a waiver changes nothing. A waiver is kept for the gate, not the status, so if a waived warning later fails it becomes a warning, not a pass.

## Undo a waiver

- In the row's details the gate shows **Un-waive** instead of **Waive**. On a run it re-screens straight away.
- Or open [Settings](/help/pages/settings) → **Waived**, which lists every waiver with its product, gate, reason and date. **Remove** deletes it and re-scores the product in every current run.

If the page says "Run migration 20260926000800_gate_overrides.sql to waive gates", the database table for waivers hasn't been created yet; run `npm run migrate`.
