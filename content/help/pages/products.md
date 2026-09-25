---
title: Product page
summary: Everything the app knows about one product: Buy, Wait or Skip with reasons and confidence, its history, every supplier's price, and the paperwork.
synonyms: [product, asin page, decision, buy wait skip, confidence, product history, find a product, search]
route: /products
order: 5
---
Each product has one page, at `/products/<ASIN>`, that brings together every run, supplier price, Keepa history and document the app has for it. Open it from **Product page →** in a row's details, the product's name in the details drawer, the Brands and Watchlist pages, the extension's **Open in app**, or the search box in the top bar (an ASIN or Amazon link opens the page; an EAN or words of the name list matches).

## The decision

A badge says **Buy**, **Wait** or **Skip**, with the reasons:

| Decision | When |
|---|---|
| **Buy** | The latest screening passes every gate, a supplier cost is known, and you can list it (open, or the brand is marked approved). Confidence isn't low. |
| **Wait** | It only warns (each warning is listed), needs approval or is blocked, has no supplier price yet, or the data is too thin to trust. |
| **Skip** | It fails a gate: which one and why. |

**Confidence** (high, medium, low) says how far to trust the figures, and **Why not more confident** lists what lowered it:

- no Keepa history, or under 90 days (low) or 6 months (medium);
- the three sales signals (rank drops, Keepa's 30-day count, Amazon's "bought in past month") differ by more than 1.8× (medium) or 3× (low);
- the FBA seller count moved by more than half in 90 days;
- Keepa data over 7 days old (medium) or 30 (low); screened over 14 days ago;
- Amazon's fee estimate and the rate card differing by more than 15%;
- a [dormant](/help/reference/glossary#dormant) listing.

Under it, the key figures each say where they came from and how old they are: profit at the landed cost, [max landed](/help/reference/glossary#max-landed), sell price, sales and [your share](/help/reference/glossary#your-share) a month, fees per unit, Amazon, and when it was screened. **Re-check** screens it again now.

When it needs approval, **Apply kit** gathers the brand's documents and the cheapest supplier's invoices (see [Apply for brand approval](/help/howto/apply-for-brand-approval)).

## Last 12 months

Charts from the latest Keepa history the app holds (no tokens spent): the Buy Box and Amazon's own price, the sales rank (log scale, better is higher), and the number of new offers. Hover for the values on a day. Links to Amazon and Keepa are in the header.

## Suppliers

The newest price from each supplier that has offered it, landed on your default profile (VAT, duty, inbound and prep), and the **Room** under max landed (green: it clears the floors; red: it doesn't). With no priced offer, **Find on Qogita** looks the EAN up.

## Screened

Every finished screening, newest first: the run (linked), its profile, verdict, score, sell price and profit, so you can see a product improve or decline.

## Approval and paperwork, and the latest screening

Your approval status for the brand, its documents and any gates you've waived. At the bottom, the latest screening in full: gates (waive from here), the per-unit money, score groups, your note, the watchlist and what the extension read.
