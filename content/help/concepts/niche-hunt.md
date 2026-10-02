---
title: Niche Hunt
summary: Private label's Niche Hunt asks Keepa's Product Finder for products that already pass Gatekeeper's Gate 0 and Gate 1, groups them into niches, and turns a niche into a candidate.
synonyms: [niche hunt, niche finder, private label hunt, find niches, product finder, gatekeeper hunt, niche ideas]
order: 6
---
Niche Hunt is the second tab on the [Private label](/help/pages/private-label) page. Instead of guessing a niche, you ask Keepa's Product Finder for products that already pass Gatekeeper's Gate 0 and Gate 1. The app groups them into niches and shows the ones with enough qualifying products. It uses the same Keepa client, token ledger and stored categories as the wholesale [Hunt](/help/pages/hunt).

## The filters

The defaults come from Gate 0 and Gate 1. All can be changed and saved as named presets (**Save as preset**, **Load a preset…**, **Delete preset**). **Reset to defaults** puts them back.

| Filter | Default | Checked by |
|---|---|---|
| Price | £18–35 (the Gate 0 band; change it for a deliberate higher-ticket test) | the finder: current Buy Box price |
| Rating | 3.8–4.3 | the finder |
| Max 90-day rank | 75,000 | the finder. A pre-filter only: the finder has no rank-drops filter, and without a rank ceiling it returns listings that barely sell |
| No Amazon offer, now or in the last 90 days | on | the finder (no Amazon offer now, Amazon held no Buy Box in 90 days), then each product's Amazon price history |
| Package weight | 500 g or less | the finder |
| Small parcel (35 × 25 × 12 cm) | on, when Keepa has the size | the finder (no side over 35 cm), then the exact fit with the sides sorted |
| Listed at least | 6 months | the finder (Keepa tracking since) |
| Leave out Amazon's own brands | on | the finder, then the brand on each product |
| Categories | Home & Kitchen, Garden, Sports & Outdoors, Pet Supplies, Stationery & Office Supplies, Baby Products, DIY & Tools | the finder, on the category a product's sales rank is in. Gate 0's avoid categories (Beauty, Health & Personal Care, Grocery, Electronics & Photo, Computers & Accessories, Toys & Games, Fashion) are shown dashed and can be ticked on |
| Min rank drops, 90 days | 300 (about 100 sales a month) | each product's detail: sales by the app's rule (rank drops ÷ 3, or Amazon's bought-past-month for a fast seller). A fast seller (90-day average rank under 5,000) with no bought-past-month figure passes on its rank, because rank drops undercount it |
| Max reviews (qualifying) | 500 | each product's detail (see below) |
| ASINs to fetch | 200 (50–500) | the cost: see below |
| Min qualifying ASINs a niche | 3 | grouping |

**Reviews decide whether a product qualifies, not whether it's fetched.** A product over the review cap that passes everything else is kept in its niche as an **incumbent**. Incumbents don't count towards the niche's size or medians, but they set its shape and its **max reviews**. Filtering big sellers out at the finder would make every niche look open.

## Niches

A niche is a **leaf browse category**: Amazon's own grouping of like products, such as "Cutlery Trays" or "Bath Mats". It's named after the category in lower case. When Keepa has no category below the root, a phrase from the title is used instead: the product noun without the brand, sizes, colours and marketing words. Product titles are often long run-ons, so the category is the better key. Correct names by hand on the candidate.

Each row shows:

- the niche and its category;
- **ASINs**: qualifying, with "+N" for its incumbents;
- **median price**, **median reviews** and **median rating** of the qualifying ASINs;
- **Sales / mo**: the qualifying ASINs' monthly sales summed. "≥" means some are fast sellers without Amazon's bought-past-month figure, so the sum is a floor;
- **Max reviews**: the most reviews on any of its products, the incumbent to beat;
- **Shape**: **Open** (no product over 1,000 reviews), **Contested** (one), **Dominated** (two or more, or one over 5,000).

Filter by shape and by qualifying ASINs, and sort by sales (the default), ASIN count or price. Click a niche to see its products: image, title, price, reviews, rating, rank, sales a month, and whether each qualifies, is an incumbent, or why not.

A hunt over a whole category returns its best sellers, which spread across many niches. With 100 ASINs over Home & Kitchen, 15 qualified but no niche reached 3. A larger cap or fewer categories gives clusters. Lower **At least … qualifying ASINs** to see the smaller niches.

## Actions

- **Create candidate** makes a Private label candidate. The niche name is both the product and the niche keyword. The referral category comes from the root category (Home & Kitchen is Home Products). Up to 10 of the niche's products are added, highest sales first, and the first is the reference. Their hunt snapshots are copied across, so only the reference's Buy Box history is fetched, about 3–4 tokens. The usual Keepa fill then runs for Gates 0, 1 and 2, and Gate 6 works out from them. The candidate opens with its token cost.
- **Opportunity Explorer** opens Seller Central's Product Opportunity Explorer with the niche name as the search, so you can capture Gate 3 next with the extension.
- **Dismiss** (bin icon) hides the niche from this and every later hunt. Give a reason. **Show dismissed niches** lists them, with **Show again**.

## Tokens

The cost is shown before you run, against your balance:

- **The finder**: 10 tokens plus 1 per 100 ASINs (12 for 200).
- **The detail**: each product's history, rating and review count, 1–2 tokens each. A product fetched by any hunt in the last 7 days is reused free.

The verification hunt (Home & Kitchen, 100 ASINs) cost 209 tokens: 11 for the finder and 198 for the detail. Each hunt's spend is recorded on the hunt and counted in Home's Keepa spend. Hunts are kept: pick an earlier one from the list above the niches.
