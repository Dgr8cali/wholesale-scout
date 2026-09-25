---
title: Hunt
summary: Find products shaped the way your default profile wants with Keepa's Product Finder, screen them without a supplier, then look for one on Qogita.
synonyms: [product finder, keepa finder, sourcing, product research, find products, reverse sourcing, qogita search]
route: /hunt
order: 6
---
Hunt starts from Amazon instead of a price list. It asks Keepa's Product Finder for products with the shape your default profile wants, screens the matches as a run with no cost, and lets you look each pass up on Qogita by its EAN to find a supplier.

## The shape

The form starts from the default [profile](/help/concepts/profiles) (First order as shipped). Change anything before you run it; **Reset to …** puts the profile's values back.

| Field | From the profile | What Keepa is asked |
|---|---|---|
| **Category** | none (All categories) | Products in that top-level category. **Load categories (1 token)** fetches Amazon UK's list once; it's kept after that. Digital stores (Kindle, Prime Video and so on) are left out. |
| **Min price (£)**, **Max price (£)** | [Price band](/help/gates/priceBand) min and max | Buy Box price (with shipping) inside the band. |
| **Min sellers**, **Max sellers** | [Competition](/help/gates/competition) min and max FBA sellers | The count of new offers inside the range. Keepa's finder counts all new offers (FBA and merchant); the run's Competition gate then checks FBA sellers. |
| **Max 90-day rank** | [Demand](/help/gates/demand): the category's own ceiling from **Max rank by category**, else **Max 90-day average rank** | 90-day average sales rank from 1 up to this. Picking a category sets it to that category's ceiling. |
| **No Amazon offer** | on unless [Amazon presence](/help/gates/amazonPresence) is off | Only listings with no Amazon offer. |
| **Results** | 100 | How many to take: 50, 100, 250 or 500, best 90-day rank first. |

**Keepa query** (collapsed) shows the exact query that will be sent.

## Cost before you run it

- **Product Finder**: 10 tokens plus 1 per 100 results (11 for 100). The live test of this page cost exactly that.
- **Screening the matches**: up to 1 token each for history (none for a product whose history is newer than the profile's **Keepa history max age**), and 3 more each for the Buy Box data of those that pass everything else. See [Keepa tokens](/help/concepts/keepa-tokens).
- Your balance is shown; **Hunt** is disabled while it's under the finder's cost.

## What you get

**Hunt** runs the finder and opens the new run, named after the shape, e.g. "Hunt · Beauty · £12–35 · 2–8 sellers · rank ≤ 60,000 · no Amazon". The finder's tokens are added to the run's Keepa total. If nothing matched, no run is made and a message suggests loosening the shape. Keepa reports up to 10,000 matches ("10,000+").

The run is like a [seller scan](/help/pages/sellers) or a [check](/help/pages/check) with no cost: every gate runs except the cost-based ones, and each row shows [max landed](/help/reference/glossary#max-landed), the most it can cost you landed and still clear the profile's floors.

## Find on Qogita

In a passing or warning row's details (rows with no cost: hunts, seller scans, checks without a cost), **Find on Qogita (EAN …)** asks Qogita for in-stock products with that EAN. It lists up to five, cheapest first, with price, case size and stock, each linking to the product on Qogita. "Not on Qogita in stock" means Qogita has none in stock right now. It needs QOGITA_EMAIL and QOGITA_PASSWORD, and the row's real EAN (read from Amazon's catalog as the run goes; a product known only by its ASIN has no button).
