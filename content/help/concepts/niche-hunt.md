---
title: Niche Hunt
summary: Private label's Niche Hunt asks Keepa's Product Finder for products that already pass Gatekeeper's Gate 0 and Gate 1, groups them into niches, and turns a niche into a candidate.
synonyms: [niche hunt, niche finder, private label hunt, find niches, product finder, gatekeeper hunt, niche ideas]
order: 6
---
Niche Hunt is the second tab on the [Private label](/help/pages/private-label) page. Instead of guessing a niche, you ask Keepa's Product Finder for products that already pass Gatekeeper's Gate 0 and Gate 1. It hunts **leaf by leaf**: a leaf browse category (such as "Cutlery Trays" or "Shaving Mirrors") is Amazon's own grouping of like products, and each leaf is a niche. It uses the same Keepa client, token ledger and stored categories as the wholesale [Hunt](/help/pages/hunt).

## How a hunt runs

A hunt runs in the background, like a screening run: it carries on with the page closed, and the watchdog restarts it if it stalls. The page shows where it has got to, for example "Sizing leaves 23/60 → Detailing 4/15", with **Cancel**.

1. **Leaves.** The leaf categories under the roots you picked, from Keepa's category tree. The biggest branches are listed first, up to 400 categories a root (40 tokens). The tree is kept for a week. The largest leaves by product count are taken, up to **Leaves to size** (60).
2. **Stage 1: size the leaves.** One Product Finder call per leaf with your filters and no product detail: about 11 tokens a leaf. It records how many products match, and keeps the leaf's 50 best sellers for stage 2. A leaf's count is reused for 7 days under the same finder filters. A leaf with fewer than **Skip leaves under … matches** (5) isn't detailed. **Show leaves sized** lists every leaf with its matches, what sizing it cost (0 when reused) and what happened in stage 2.
3. **Stage 2: detail the promising leaves.** The **N** leaves with the most matches (**Leaves to detail**, 15). For each, the detail of up to **ASINs per leaf** (12) best sellers: about 2 tokens each, free for any product fetched in the last 7 days. Each product is then qualified, and the leaf becomes a niche.

## The filters

The defaults come from Gate 0 and Gate 1. All can be changed and saved as named presets (**Save as preset**, **Load a preset…**, **Delete preset**). **Reset to defaults** puts them back. Two presets come ready: **Home & Kitchen — first pass** (60 leaves, 15 detailed) and **Garden + Pet + Sports**.

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
| Categories | Home & Kitchen, Garden, Sports & Outdoors, Pet Supplies, Stationery & Office Supplies, Baby Products, DIY & Tools | the roots whose leaves are hunted; the finder asks for products listed directly in each leaf. Gate 0's avoid categories (Beauty, Health & Personal Care, Grocery, Electronics & Photo, Computers & Accessories, Toys & Games, Fashion) are shown dashed and can be ticked on |
| Min rank drops, 90 days | 300 (about 100 sales a month) | each product's detail: sales by the app's rule (rank drops ÷ 3, or Amazon's bought-past-month for a fast seller). A fast seller (90-day average rank under 5,000) with no bought-past-month figure passes on its rank, because rank drops undercount it |
| Max reviews (qualifying) | 500 | each product's detail (see below) |
| Leaves to size | 60 (1–200) | stage 1 |
| Skip leaves under … matches | 5 | stage 1 |
| Leaves to detail (N) | 15 (1–50) | stage 2 |
| ASINs per leaf | 12 (1–50) | stage 2 |
| Min qualifying ASINs a niche | 3 | grouping |

**Reviews decide whether a product qualifies, not whether it's fetched.** A product over the review cap that passes everything else is kept in its niche as an **incumbent**. Incumbents don't count towards the niche's size or medians, but they set its shape and its **max reviews**. Filtering big sellers out at the finder would make every niche look open.

## Niches

Each detailed leaf is a niche, named after the leaf in lower case. Correct the name on the candidate if you want. Each row shows:

- the niche and its category;
- **ASINs**: qualifying, with "+N" for its incumbents;
- **median price**, **median reviews** and **median rating** of the qualifying ASINs;
- **Sales / mo**: the qualifying ASINs' monthly sales summed. "≥" means some are fast sellers without Amazon's bought-past-month figure, so the sum is a floor;
- **Max reviews**: the most reviews on any of its products, the incumbent to beat;
- **Shape**: **Open** (no product over 1,000 reviews), **Contested** (one), **Dominated** (two or more, or one over 5,000).

Niches with at least **Min qualifying ASINs a niche** (3) qualifying products are shown. **At least … qualifying ASINs** above the list changes that on the spot. Filter by shape, and sort by sales (the default), ASIN count or price. Click a niche to see its products: image, title, price, reviews, rating, rank, sales a month, and whether each qualifies or is an incumbent.

## Actions

- **Create candidate** makes a Private label candidate. The niche name is both the product and the niche keyword. The referral category comes from the root category (Home & Kitchen is Home Products). Up to 10 of the niche's products are added, highest sales first, and the first is the reference. Their hunt snapshots are copied across, so only the reference's Buy Box history is fetched, about 3–4 tokens. The usual Keepa fill then runs for Gates 0, 1 and 2, and Gate 6 works out from them. The candidate opens with its token cost.
- **Opportunity Explorer** copies the niche name to your clipboard and opens Seller Central's Product Opportunity Explorer in a new tab ("Niche name copied — paste into the POE search box"). Amazon doesn't take a search in the address. Capture Gate 3 there with the extension.
- **Dismiss** (bin icon) hides the niche from this and every later hunt. Give a reason. **Show dismissed niches** lists them, with **Show again**.

## Tokens

The estimate is shown before you run, line by line, against your balance:

- **Category tree**: up to 40 tokens a root not listed in the last week (1 token per 10 categories).
- **Stage 1**: the leaves to size × 11 tokens. A leaf counted in the last 7 days under the same filters is free.
- **Stage 2**: N leaves × ASINs per leaf × about 2 tokens, less products fetched in the last 7 days.

A hunt won't start if its estimate would leave fewer than **100 tokens** in the balance. The page then offers to detail fewer leaves (**Detail K leaves instead**), or you can size fewer leaves or wait for the refill (21 tokens a minute). If Keepa runs out part-way, the hunt waits ("Waiting for Keepa tokens") and carries on after the refill. Each hunt's spend is recorded on the hunt and counted in Home's Keepa spend. Hunts are kept: pick an earlier one from the list above the niches.

For example, one leaf sized and detailed (Shaving Mirrors, 9 ASINs) cost 20 tokens. The **Home & Kitchen — first pass** preset estimates up to 1,060: 40 for the tree, 660 to size 60 leaves, 360 to detail 15.
