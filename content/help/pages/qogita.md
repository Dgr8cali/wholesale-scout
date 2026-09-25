---
title: Qogita
summary: Pull in-stock products from Qogita by category or brand, screen them like a price list, and save the pull to run again or re-pull nightly.
synonyms: [qogita pull, wholesale marketplace, preset, saved pull, nightly, mov, cart, supplier offers]
route: /qogita
order: 5
---
The Qogita page pulls in-stock products straight from Qogita and screens them like an uploaded price list: supplier "Qogita", prices per piece, ex-VAT. Each pull is saved by name so you can run it again, or have it re-pulled every night.

If Qogita isn't set up, the page says "Qogita isn't connected" and asks for QOGITA_EMAIL and QOGITA_PASSWORD in the environment. See [Add an environment variable](/help/howto/add-an-env-var).

## Choosing what to pull

You need a category or at least one brand. Prices are in your Qogita account's currency (euros).

| Field | What it does |
| --- | --- |
| **Category** | Opens a searchable category tree (**Find a category**). Pick any level: a parent pulls every category under it. The number beside a node is how many leaf categories it holds. The × clears it. |
| Categories under it | When the chosen category has several leaf categories, tick the ones you want ("All 12 categories under it"). **all** and **none** tick or untick every one. |
| **Brands** | Type a brand as Qogita writes it and press Enter or **Add**. Each is checked with Qogita first; an unknown one gives "Qogita has no brand called "X". Check the spelling as Qogita writes it." Click a brand chip to remove it. With both a category and brands, only those brands in that category are pulled. |
| **Min price (€ per piece)**, **Max price (€ per piece)** | Leaves out products priced outside this range. Blank means any. |
| **Max delivery (weeks)** | Leaves out products Qogita estimates will take longer. Products with no estimate are kept. |
| **MOV limit (€)** | The most a supplier's minimum order value may be. Qogita's product search can't filter on it, so it's applied later, to the supplier offers of rows that pass (see [Supplier offers](#supplier-offers)). |
| **Max products** | The pull stops once it has this many (default 500, at most 5,000). |
| **Skip EANs screened in the last N days** | Default 7. Products screened in any run within that time reuse their recent result, re-checked at the new price, with no Amazon or Keepa calls. 0 screens everything. |

Price and delivery are filtered as the products come in; products out of stock or without a GTIN are left out.

### Save as and Profile

- **Save as**: the pull's name, for example "K-beauty masks under €10". Required. Pulling saves the filters under this name; reusing a name you've saved before updates that saved pull.
- **Profile**: the profile to screen with; your default profile is picked for you. See [Profiles](/help/concepts/profiles).

### The estimate

A moment after you change the filters, a line estimates the pull before you spend anything: "About 420 products (1,830 on Qogita) · 60 reused · ~9 min on Amazon · ~540 Keepa tokens". It's worked out from the first page of results; minutes and tokens come from your recent Qogita runs (40 rows a minute and 1.5 tokens a row until you have some). See [Keepa tokens](/help/concepts/keepa-tokens).

### Pull and screen

**Pull and screen** pulls the products and opens the new run, named "Qogita · [name] · 25 Sept". The message tells you what happened, for example "Pulled 420 products; 38 outside the price range, 12 too slow to deliver; 60 reused from the last 7 days. Screening now." If it stopped early you'll see "stopped at Max products" (a pull also stops after about 40 seconds of paging). If nothing matched, you'll get "Nothing matched" with the reasons, and no run is made.

Until you've chosen a category or brand and named the pull, the button is disabled and the page says "Choose a category or a brand, and name the pull."

## Saved pulls

Every pull is listed on the right by name, with its filters in short ("Skin care › Masks · €2–€10 · ≤ 2 wk delivery · MOV ≤ €300") and when it last ran ("(nightly)" if it was the nightly job), how many were screened, and a **run** link.

| Control | What it does |
| --- | --- |
| The pull's name | Loads its filters, name and profile into the form, to change or pull again. |
| **Run again** | Pulls it now with its saved filters and profile, and screens everything it keeps (products screened recently are reused, as set on the pull). |
| **Re-pull nightly** | Turns the nightly re-pull on or off. |
| Bin | Deletes the saved pull after you confirm. Its runs are kept. |

### Nightly re-pulls

With **Re-pull nightly** on, the pull runs again every night (the job starts at 03:00 UTC and works through each pull not pulled in the last 20 hours). A nightly pull screens only products that are new or whose price moved since the last pull; the rest are left alone. The run is named with "(nightly)". [Home](/help/pages/home) shows the night's results under **Qogita overnight**: how many were new, re-priced and unchanged, and how many new passes, with a link to the run.

## Supplier offers

Several suppliers on Qogita may sell the same product. For each Qogita row that passes every gate, the app fetches every supplier's offer, within the pull's MOV limit and max delivery, and chooses one: the cheapest whose MOV fits your profile's budget and that holds at least one case. When none fits, the cheapest is kept so the [Budget fit](/help/gates/budgetFit) gate can say by how much its MOV is over. The row's cost, case size and MOV then come from that supplier.

In the row's details on the run page, **Qogita offers** lists every supplier with price per piece, ≈ GBP, MOV, price tiers, case size, stock and delivery, and marks the chosen one "fits the budget". The line above says why, for example "Cheapest offer whose MOV fits the budget (2 cheaper ones don't)", how many offers the limits left out, and when the offers were checked.

## Adding to your Qogita cart

For a Qogita row that passed or warned, the row's details on the run page end with **Quantity** and **Add to Qogita cart**. The quantity starts at the most your line budget (budget × max line share) buys from the chosen supplier, in whole cases and no more than they hold. A quantity that isn't whole cases shows "Order whole cases of 6." and can't be added. [Plan](/help/pages/plan) can add a whole order at once with **Add N to Qogita cart**.

**Cart** in the top bar (with the number of lines) opens your Qogita cart:

- One section per supplier, with its subtotal "of €X MOV", a bar to the MOV, and **MOV met** or "€X to go", plus the delivery estimate.
- Each line with its price, case size, how many are available and any warnings from Qogita (price went up, out of stock, quantity reduced). Change the quantity and press **Update**, or use the bin to remove it.
- **Refresh** reloads the cart; **Check out on Qogita** opens your cart on Qogita, where you place the order.

The Cart button only appears when Qogita is connected.
