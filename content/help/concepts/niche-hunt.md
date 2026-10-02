---
title: Niche Hunt
summary: Private label's Niche Hunt asks Keepa's Product Finder for products that already pass Gate 0 and Gate 1, groups them into niches, and turns a niche into a candidate.
synonyms: [niche hunt, niche finder, private label hunt, find niches, product finder, gatekeeper hunt, niche ideas, direct mode, leaf mode, token cap]
order: 6
workspace: pl
route: /pl/niche-hunt
---
Niche Hunt is a page in the [Private label](/help/pages/private-label) workspace (**Private label → Niche Hunt**). Instead of guessing a niche, you ask Keepa's Product Finder for products that already pass Gate 0 and Gate 1, and group them by leaf browse category: a leaf (such as "Cutlery Trays" or "Shaving Mirrors") is Amazon's own grouping of like products, and each leaf is a niche. It uses the same Keepa client, token ledger and stored categories as the wholesale [Hunt](/help/pages/hunt).

There are two modes, picked at the top of the filters.

## Direct mode (the default)

One Product Finder query per category you pick, with every qualifying threshold **Keepa applies itself**, sorted by 90-day rank drops (most first), in pages of 50:

| Applied by Keepa | Default |
|---|---|
| The category the product ranks in | the roots you pick |
| Buy Box price | £15–40 |
| Rating | 3.6–4.5 |
| Reviews | at most 500 |
| Sales a month (Amazon's "bought in past month") | at least 100 (rank drops ÷ 3) |
| Package weight | at most 700 g (500 g is checked on the detail; 500–700 g is a near miss) |
| No Amazon offer now | on |
| Tracked by Keepa for at least | 6 months |
| Not an Amazon brand | on |

**Pages a category** (4, up to 10) sets how many pages of 50 it takes from each category. The products found are then detailed (about 2 tokens each, free for any fetched in the last 7 days), checked for what Keepa's query can't check (Amazon in the last 90 days, weight, the small-parcel size), and grouped by their own leaf category.

What Keepa's query can't do, found by testing it:

- **Rank drops** can be filtered (salesRankDrops90), but Keepa's count tops out low: no Pet Supplies product under these filters had 300 drops in 90 days (81 had 100). So direct mode asks for sales a month instead, and sorts by rank drops.
- **Weight**: Keepa's filter also leaves out products whose weight it doesn't know, about 0.4% of matches (125 of 28,582 when measured on Pet Supplies). Keepa doesn't report that count per query, so "Why so few?" gives the measured share. Without the filter, over half the products detailed were too heavy.
- **Incumbents**: with reviews capped in the query, the hunt itself finds none. So at the end of every direct hunt, **every niche with 3+ qualifying products** (up to 30) gets an **incumbent check**: one finder page of its leaf's best sellers by rank with more reviews than the cap, any price, and the top 10 detailed for their review counts. They count as the niche's incumbents (whatever else they fail, such as a price over £40), so its **shape** and **max reviews** are real. About 31 tokens a niche (a finder page is at least 50 results, 11 tokens, and the finder returns ASINs only, so the 10 are detailed at about 2 each); the estimate shows it as "+ incumbents". A finished direct hunt has **Check incumbents** to run it again.
- **Unchecked**: a direct-mode niche whose leaf hasn't had the incumbent check (fewer than 3 qualifying, or the check didn't run) shows shape **Unchecked**, never Open: the hunt's own data can't see the incumbents.
- **Off-niche incumbents**: a leaf can list products that aren't the niche's. An incumbent that Amazon files in **another category** (its own leaf in Keepa), and whose title doesn't name the niche, is marked **Off-niche incumbent**: listed greyed in the niche's products, and left out of its shape, max reviews and incumbent count. For example, compression socks (filed in Socks) among hydration packs. A product filed in the niche's own leaf always counts; one filed elsewhere still counts when its title names the niche (an antiseptic spray "for itchy skin", filed in First Aid, among itch remedies). Sharing a word like "running" isn't enough. When Keepa has no leaf for a product, it's off-niche only if its title shares no significant word with the niche's products.

The page shows "Finder pages 6/10 (300 ASINs) → Detailing 150/500" as it goes. For example, Garden, Pet Supplies, Sports & Outdoors, Baby Products and Stationery & Office Supplies at 2 pages each found 500 products (of 2,125 matches) for 1,104 tokens: 135 qualifying and 48 near misses. The incumbent check on its five niches with 3+ qualifying cost 150 more and turned all five from "Open" to "Dominated" (max reviews 3,354 to 21,295).

## Leaf mode

Leaf by leaf: each leaf is sized with wide finder filters, then the most promising leaves are detailed. It costs more (a finder call per leaf, and the category tree), but shows each leaf's whole page one, incumbents included.

The page shows where it has got to, for example "Sizing leaves 23/60 → Detailing 4/15", with **Cancel**. Either mode runs in the background, like a screening run: it carries on with the page closed, and the watchdog restarts it if it stalls.

1. **Leaves.** The leaf categories under the roots you picked, from Keepa's category tree. The biggest branches are listed first, up to 400 categories a root (40 tokens). The tree is kept for a week. The largest leaves by product count are taken, up to **Leaves to size** (60).
2. **Stage 1: size the leaves.** One Product Finder call per leaf with your filters and no product detail: about 11 tokens a leaf. It records how many products match, and keeps the leaf's 50 best sellers for stage 2. A leaf's count is reused for 7 days under the same finder filters. A leaf with fewer than **Skip leaves under … matches** (5) isn't detailed. **Show leaves sized** lists every leaf with its matches, what sizing it cost (0 when reused) and what happened in stage 2.
3. **Stage 2: detail the promising leaves.** The **N** leaves with the most matches (**Leaves to detail**, 15). For each, the detail of up to **ASINs per leaf** (12) best sellers: about 2 tokens each, free for any product fetched in the last 7 days. Each product is then qualified, and the leaf becomes a niche.

## The filters

In leaf mode, the gates' pass thresholds used as hard finder filters compound: the first real hunt (60 leaves, 148 products detailed) found 7 that qualified. So leaf mode's filters come in two groups; direct mode uses the qualifying thresholds as its query. The defaults can be changed and saved as named presets (**Save as preset**, **Load a preset…**, **Delete preset**); **Reset to defaults** puts them back. Two presets come ready: **Home & Kitchen — first pass** and **Garden + Pet + Sports**.

**Finder filters (wide — what Keepa searches)**, leaf mode only, asked of the Product Finder for each leaf:

| Filter | Default |
|---|---|
| Price | £14–45 (Buy Box) |
| Rating | 3.5–4.7 |
| Max 90-day rank | 100,000 |
| No Amazon offer now | on |
| Listed at least | 6 months |
| Leave out Amazon's own brands | on |

There's no weight or size filter in the finder: Keepa often lacks them, and the finder drops a product it can't measure.

**Qualifying thresholds (what counts as page-one material)**, checked on each product's detail in both modes. They default to the gates' **warn band**: a hunt finds; the candidate's scorecard then judges on the pass band (£18–35, 3.8–4.3).

| Check | Default |
|---|---|
| Price | £15–40 |
| Rating | 3.6–4.5 |
| Demand | 300 rank drops in 90 days (100 sales a month) by the app's sales rule: rank drops ÷ 3, or Amazon's bought-past-month for a fast seller. A fast seller (90-day average rank under 5,000) without bought-past-month passes on its rank, because rank drops undercount it |
| No Amazon in the last 90 days | on |
| Not an Amazon brand | on |
| Package weight | 500 g or less (unknown weight passes, marked "weight unknown") |
| Small parcel (35 × 25 × 12 cm) | on, when Keepa has the size |
| Max reviews | 500 |

Each detailed product is then one of:

- **Qualifies**: passes everything.
- **Near miss**: fails only the gates' warn band (price £15–40, rating 3.6–4.5, weight up to 700 g), or is missing its size. Unknown weight isn't a miss: the product qualifies, marked "weight unknown". Demand, Amazon and brand are never near misses.
- **Incumbent**: no hard fail, but over the review cap. Incumbents are the competition: they count for the niche's shape and max reviews, not its size.
- **Fails**: anything else, with the reason.

The other settings: **Leaves to size** (120, the largest first; see Tokens), **Skip leaves under … matches** (5), **Leaves to detail** (N, 15), **ASINs per leaf** (12), **Min ASINs a niche** (3), and **Categories** (the roots whose leaves are hunted: Home & Kitchen, Garden, Sports & Outdoors, Pet Supplies, Stationery & Office Supplies, Baby Products, DIY & Tools; Gate 0's avoid categories are shown dashed and can be ticked on).

## Niches

Each detailed leaf is a niche, named after the leaf in lower case. Correct the name on the candidate if you want. Each row shows:

- the niche and its category;
- **Q · near · inc**: qualifying products, near misses, incumbents;
- **median price**, **median reviews**, **median rating** and **Sales / mo** (summed) over the qualifying products and near misses. "≥" means some are fast sellers without bought-past-month, so the sum is a floor;
- **Max reviews**: the most reviews among them and the incumbents, the incumbent to beat;
- **Shape**: **Open** (no product over 1,000 reviews), **Contested** (one), **Dominated** (two or more, or one over 5,000), or in direct mode **Unchecked** until the niche's incumbent check has run.

**At least … ASINs** counts qualifying products plus near misses; turn on **Strict** to count qualifying ones only. Filter by shape, and sort by sales (the default), count or price. Click a niche to see every detailed product: image, title, price, reviews, rating, rank, sales a month, and **Qualifies**, **Near miss**, **Incumbent** or **Fails** with the reasons.

**Re-qualify this hunt** applies the qualifying thresholds as they are now set on the page to the hunt's products again: 0 tokens, no Keepa call. The finder filters and the leaves can't change without a new hunt.

**Why so few?** under the results follows every detailed product through the qualifying checks in order and says how many each removed, and how many it let through as near misses, then how many are incumbents. For example: "148 detailed → price £18–35: −0 (2 near misses let through) → 100+ sales a month: −125 → 500 g or less: −0 (14 near misses let through) → small parcel: −1 (16 near misses let through) → over 500 reviews: 15 incumbents = 0 qualifying + 7 near misses". The check that removes the most is the one biting. It also says how many leaves were sized, their finder matches, and how many had none.

## Actions

- **Create candidate** makes a Private label candidate. The niche name is both the product and the niche keyword. The referral category comes from the root category (Home & Kitchen is Home Products, Sports & Outdoors is Sports and Outdoors, Stationery & Office Supplies is Office Products). Up to 10 of the niche's page-one products are added: qualifying ones first (by sales), then incumbents by rank, then near misses. The **reference** is the best seller among them by 90-day sales rank; check it suits (a much cheaper or newer listing makes Gate 2 thin) and change it on the candidate if not. Their hunt snapshots are copied across, so only the reference's Buy Box history is fetched, about 3–4 tokens. The usual Keepa fill then runs for Gates 0, 1 and 2, and Gate 6 works out from them. The candidate opens with its token cost.
- **Opportunity Explorer** copies the niche name to your clipboard and opens Seller Central's Product Opportunity Explorer in a new tab ("Niche name copied — paste into the POE search box"). Amazon doesn't take a search in the address. Capture Gate 3 there with the extension.
- **Dismiss** (bin icon) hides the niche from this and every later hunt. Give a reason. **Show dismissed niches** lists them, with **Show again**.

## Tokens

The estimate is shown before you run, line by line, against your balance. **A hunt never spends more than its estimate + 10%**: it starts no Keepa call that would take it past that (the page shows "it stops at …"), and finishes with what it has, saying "Stopped at the token cap". Before each call it checks the balance: if the call doesn't fit, it waits for Keepa's refill and carries on.

Direct mode: **finder pages** (categories × pages a category) × 11 tokens, plus **detail** of up to 50 products a page × about 2 tokens, less products fetched in the last 7 days, plus **incumbents**: every niche with 3+ qualifying (up to 30) × about 31; only the niches that turn out to have 3+ qualifying are checked, so the spend is usually far below the "up to" figure. No category tree. The finder pages must fit the balance less the reserve to start; detail may wait for the refill.

Leaf mode:

- **Category tree**: up to 40 tokens a root not listed in the last week (1 token per 10 categories).
- **Stage 1**: the leaves to size × 11 tokens. A leaf counted in the last 7 days under the same finder filters is free (the qualifying thresholds don't affect counts). Stage 1's spend is **capped by the balance**: the largest leaves are sized first, as many as the balance allows after the reserve, the tree and stage 2. Leaves that don't fit show "not sized (balance)".
- **Stage 2**: N leaves × ASINs per leaf × about 2 tokens, less products fetched in the last 7 days.

A hunt keeps **100 tokens** in the balance. If not even N leaves can be sized, it won't start, and the page offers to detail fewer (**Detail K leaves instead**); or wait for the refill (21 tokens a minute). **Only one hunt runs at a time**: a second is refused while one is running, since two at once can't reuse each other's counts. If Keepa runs out part-way, the hunt waits ("Waiting for Keepa tokens") and carries on after the refill. Each hunt's spend is recorded on the hunt and counted in Home's Keepa spend. Hunts are kept: pick an earlier one from the list above the niches.

For example, one leaf sized and detailed (Shaving Mirrors, 9 products) cost 20 tokens; the first real Home & Kitchen hunt (60 leaves, 15 detailed) cost 769. A leaf hunt over five categories estimated 1,154 and spent 1,875 before the cap existed: listing the trees reset its sizing budget, so it sized all 120 leaves.
