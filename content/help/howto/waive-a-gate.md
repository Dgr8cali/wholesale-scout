---
title: Waive a gate
summary: Accept a failed gate for one product so it carries on through the later gates, fees and score.
synonyms: [waiver, override, accept, ignore gate, un-waive, exception]
order: 2
---
A [waiver](/help/reference/glossary#waiver) tells the app you accept a gate's fail for one product. The fail becomes a warning, so the row carries on through the later gates, fees and the [score](/help/concepts/score). Use it when you know better than the gate, for example you already hold the paperwork a compliance rule asks for, or you're happy with the seller count.

## Waive one product

1. Open a run on the [Runs](/help/pages/runs) page (or [Favourites](/help/pages/favourites)) and open a failed row's details.
2. In the gates list, the failed gate has a **Waive** link next to its why-line.
3. Click **Waive**. A box appears: type a reason if you like (**Reason (optional)**, up to 300 characters), then press Enter or click **Waive**. **Cancel** backs out.

On a run, that product's rows in the run are re-screened straight away. If the later gates need data that was never fetched (the row stopped early, before Keepa or Amazon were asked), the app fetches it in the background and says "… waived; fetching the data later gates need for this product." That can spend [Keepa tokens](/help/concepts/keepa-tokens).

On Favourites the waiver is saved but the row isn't re-screened: "… waived: it applies when the product is next screened."

## Waive many at once

Select rows with their tick boxes. In the bar that appears, choose the gate in **Gate to waive or un-waive**, add a reason if you like, and click **Waive**. **Un-waive** removes that gate's waiver from the selected products.

## What a waiver does

- It applies to the product in **every** run, now and later, not just this one. It is stored by EAN and ASIN.
- The gate still runs. If it fails, it's recorded as a warning with your reason on the end, for example: "Sells at £10.50, under the £12.00 floor (waived by you: bundle sells higher)".
- The row gets a **waived** badge in the results table.
- A waived gate counts as a warning in the Risk group, so the score is a little lower than if the gate had passed.
- A waiver only changes a fail. If the gate passes or warns, nothing changes.

## Undo a waiver

- In the row's details the gate shows **Un-waive** instead of **Waive**. On a run it re-screens straight away.
- Or open [Settings](/help/pages/settings) → **Waived**, which lists every waiver with its product, gate, reason and date. **Remove** deletes it; this applies the next time a run is screened or re-screened.

If the page says "Run migration 20260926000800_gate_overrides.sql to waive gates", the database table for waivers hasn't been created yet; run `npm run migrate`.
