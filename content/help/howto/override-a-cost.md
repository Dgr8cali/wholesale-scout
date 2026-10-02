---
title: Override a cost
summary: Give a product your own cost (a landed cost, or a supplier price and its VAT basis). It competes with the sheet's price in every run; the cheaper is scored.
synonyms: [cost override, manual cost, my cost, landed cost, set cost, clear cost, supplier price, manual supplier, better price]
order: 3
workspace: wholesale
---
When you can buy a product cheaper than the sheet says (a cash-and-carry price, a quote from another supplier, a deal you've agreed), give the app your cost. The row is re-scored straight away from its stored data, with no Amazon or Keepa calls.

## Set a cost for one row

1. Open a row's details on a run, on [Favourites](/help/pages/favourites) or on the [product page](/help/pages/products).
2. Under the per-unit money, click **Set your cost**.
3. Choose what you're entering:
   - **Landed cost per unit**: everything to get one unit to Amazon (goods, VAT you can't reclaim, duty, prep and inbound).
   - **Supplier price per unit**, then **Price excludes VAT** or **Price includes VAT (20%)**. Your profile's duty, VAT, prep and inbound are added, as for any supplier.
4. Add a supplier name and a note if you like, and an **MOQ** (units) or **MOV** (£) if the supplier has one. Then **Save cost**.

## Set or clear it for many rows

Tick rows on a run or on Favourites. In the bulk bar, **Set cost…** opens the same form and applies one cost to every selected product. **Clear cost** removes the override from every selected product.

## What happens

- It's kept as an offer from the **Manual** supplier (it shows on [Suppliers](/help/pages/suppliers)), one per product, with your supplier name and note.
- On every screening and re-screen, in every run, it competes with the sheet's price. Both are compared per Amazon listing, with VAT on goods counted when you're not VAT registered. **The cheaper is scored.** A row with no sheet cost (an ASIN check or a hunt) always uses yours.
- A landed cost is worked back to a unit cost using each run's profile, so the row's landed cost comes out as the figure you entered.
- A row scored on your cost gets a **cost overridden** badge next to its verdict. Hover over it to see your cost and the sheet's original (supplier, ex-VAT price and landed cost). It uses the MOQ and MOV you set (none if you left them blank), not the sheet's. No multipack ratio is applied: your cost is per listing.
- When your cost isn't the cheaper, the details say "Your cost isn't cheaper than the sheet's; the sheet's is scored". Hover for both figures.
- The product's rows are re-scored now in every current run (not archived), from stored data, each on its run's own profile. Brands, Suppliers and the order planner catch up a moment later.

## Change or clear it

In the row's details, next to **cost overridden**, **Edit** opens the form with your figures, and **Clear** removes the override. Clearing puts every run back on the sheet's offer. Its rows in every current run are re-scored now.

## In the order planner

Your cost is a buyable offer in the [order planner](/help/pages/plan), under the supplier name you gave ("Your cost" if none), with MOQ 1 and no MOV unless you set them. It competes with the sheet suppliers' offers there too. A product that passes but has no offer at all is listed under **Not in the plan** as "no supplier offer", with **Set cost & plan** to set one and plan it in one go.
