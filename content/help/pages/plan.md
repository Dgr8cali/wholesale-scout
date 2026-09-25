---
title: Order plan
summary: The order planner picks which products to buy, how many and from whom to make the most profit a month within your budget.
synonyms: [order planner, purchase order, basket, budget, optimise, buy list, qogita cart]
route: /plan
order: 11
---
The Order plan page turns your passing products into an order. It picks the products and quantities that make the most profit a month within your budget, grouped into one order per supplier. You can pin, exclude and change quantities, and the plan recomputes as you go.

## What it plans from

The candidates are every product whose latest result **passes** on your **default profile** (shown in the page description, with "as of" the time of the latest figures). To be a candidate, a product needs at least one costed offer. For each product the planner considers:

- the cheapest offer from **each** supplier that offers its EAN (uploaded price lists and Qogita; Check ASINs and seller scans have no cost, so they're left out), and
- for Qogita, the offer from the Qogita seller chosen for it. Each Qogita seller counts as its own order, with its own MOV and case size.

Each supplier's price is turned into a landed cost with your default profile's fees. It must still clear the profile's profit floors (minimum profit, ROI and margin) at that price, or that supplier isn't offered for it. The figures come from the stored results, so nothing is fetched and the page is quick. To bring them up to date, re-screen. See [Runs](/help/pages/runs).

## The limits

These come from your default profile and are shown in the **Limits** box:

- **Budget**: the most the whole order can cost, landed. The shipped profiles all use £1,000.
- **Line cap**: the most one line can cost, landed. It's the budget × the [budget gate](/help/gates/budgetFit)'s line share. On "First order", the shipped default, that's 25%, so £250.
- **Months limit**: each line must sell within this many months at your share. That's the [demand gate](/help/gates/demand)'s months to sell, 3 by default.

To change them, edit the profile. See [Change a threshold](/help/howto/change-a-threshold).

## How it optimises

1. **Size each line.** The quantity is the smallest of: what fits the line cap, what sells within the months limit at [your share](/help/reference/glossary#your-share), and the supplier's stock (when known). It's then rounded down to whole cases. If that comes out under the MOQ, the MOQ is used, as long as the MOQ itself fits the line cap and the months limit. Otherwise the product is skipped with the reason.
2. **Rank the lines** by profit a month per £ spent.
3. **Fill the budget** in that order, skipping lines that would take it over budget. A product is only bought from one supplier.
4. **Check each supplier's MOV.** A supplier whose lines don't reach its MOV (measured on goods ex VAT) is topped up from its own other products, best first. If it still can't reach the MOV, it's dropped and the budget is refilled from the rest. This repeats up to 8 times.

It's a good heuristic rather than a guaranteed best answer. A month's profit for a line is your share of sales × profit per unit, but never more units than you bought.

## The controls

| Control | What it does |
|---|---|
| **Include warns** | Adds products that warn, as well as those that pass. Off by default. |
| **Reset** | Clears all your pins, exclusions and quantities. It only appears once you've made a change. |
| **Add N to Qogita cart** | Adds every Qogita line in the plan to your Qogita cart, at the planned quantity, and opens the cart. It then tells you "N of M Qogita lines added". It only appears when Qogita is set up and the plan has Qogita lines. See [Qogita](/help/pages/qogita). |
| **Export xlsx** | Downloads `wholesale-scout-plan-<date>.xlsx` with three sheets. **Plan** has one row per line: supplier, product, brand, EAN, ASIN, qty, unit cost ex VAT, landed and profit per unit, sell price, your share, months to sell, line total, profit a month, verdict, pinned, notes. **Suppliers** has goods ex VAT, MOV, whether the MOV is met, and the landed total. **Summary** has the profile, budget, line cap, months limit, plan total, profit a month and payback. |

Your pins, exclusions and quantities are remembered in this browser between visits.

### On each line

| Control | What it does |
|---|---|
| **Qty** box | Sets your own quantity. It's raised to the MOQ and to whole cases if needed, and a note says so ("raised to 24 (MOQ / case of 12)"). Hover over the box for how many fit the line cap. Clear it to go back to the planner's quantity. |
| Pin | Keeps the product in the plan whatever happens, even if it takes the plan over budget or breaks a limit. The planner still fills around it. A pinned supplier is never dropped for missing its MOV. |
| **×** (Exclude) | Takes the product out of the plan. It moves to **Not in the plan** as "excluded by you". |

A line with a problem is tinted amber, and its notes say what's wrong, for example "£320.00, over the £300.00 line cap", "sells in 4.2 months, over 3" or "only 40 in stock".

## Reading the plan

### Totals

- **Plan total**: the landed cost of everything, with "of £1,000.00 budget · £120.00 left". It shows in red with "over" if pins take it over budget.
- **Profit / month**: at your share of sales.
- **Payback**: how long until sales bring back what you spent (each unit sold returns its landed cost plus its profit).
- **Lines**: how many lines, and in how many supplier orders.
- **Limits**: the line cap and months limit.

### The table

Lines are grouped by supplier. The biggest order comes first, and the supplier name links to its [supplier page](/help/pages/suppliers). The supplier row shows goods ex VAT, "MOV £150.00 met" (green) or "not met" (red), and the landed total.

The columns are **Qty**, **Landed / unit**, **Profit / unit**, **Your share** (sales a month), **Months to sell**, **Line total** and **Profit / mo**. Under the product you'll see its brand, ASIN, MOQ and case size. For a warn, it also shows "warns:" and the gates that warned.

### If approved

This lists products that warn **only** because the brand needs approval. They aren't planned, so you can see what approval would unlock. **Pin** one to plan it anyway. See [Apply for brand approval](/help/howto/apply-for-brand-approval).

### Not in the plan

Open this to see every candidate left out, and why:

- "excluded by you"
- "no profit at this supplier's price"
- "no sales share to size an order"
- "MOQ 48 × £6.20 is over the £300.00 line cap"
- "MOQ 48 takes 6.0 months to sell, over 3"
- "only 10 in stock, under the MOQ 24"
- "bought from <another supplier> instead"
- "<Supplier>'s MOV £500.00 not reachable within the budget"
- "doesn't fit the budget"

**Pin** puts a skipped product in. **Include** brings back one you excluded.

## When it's empty

- "No product passes on <profile> with a costed offer. Switch on “Include warns” to plan from products that warn."
- "No product passes or warns with a costed offer." (with warns included)
- "No candidate fits: see why below." Check **Not in the plan**.
