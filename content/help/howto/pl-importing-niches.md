---
title: "Private label: importing Opportunity Explorer niches"
summary: Download a category's niches from Amazon's Product Opportunity Explorer, import them on Private label → Niches, read the score and the flags, shortlist, check incumbents only on the shortlist, and turn the best into candidates.
synonyms: [niche import, niches, opportunity explorer, poe, product opportunity explorer download, niche csv, niche score, flags, spike, fading, big brand, electrical, regulated, heavy bulky, low units, shortlist, incumbent check]
workspace: pl
order: 1
route: /pl/niches
---
**Private label → Niches** imports Amazon's own niche data, a whole category at a time, scores every niche from its figures, and flags the ones to be wary of. It spends **no Keepa tokens** until you ask for an incumbent check on a niche.

## Download from Opportunity Explorer

In Seller Central: **Growth → Product Opportunity Explorer**, the **Niche** view, pick a category (for example DIY & Tools), then **Download**. The CSV holds every niche in the category (up to 500). Don't edit it: the app reads it as Amazon writes it, including the title and blank line before the header, the BOM, the apostrophe Excel-proofing puts before negative numbers, and the three "Top Search Term" columns.

## Import

On **Niches**, drop the CSV (or choose it), pick its **Opportunity Explorer category** (guessed from the file name when it can be: diy-tools.csv is DIY & Tools), and **Preview**. The list is Opportunity Explorer's top-level UK categories; **Other…** takes a name of your own. Next to it is the **fee category**: the rate card category a candidate created from these niches uses for its referral fee (DIY & Tools → Tools and Home Improvement, Garden → Lawn and Garden, Kitchen & Home Appliances → Compact Appliances, Books → Everything else…). For an Other… name it comes from the rate card's own name list, else Everything else, and shows with the preview. Imports made before the list keep the name they were given, and get the fee category when the name matches one on it. The preview shows:

- the line the header was found on, the rows read, and the niches after merging duplicates;
- every field and the column it came from: columns are matched by name with case, spaces and punctuation ignored, so a future export with renamed or reordered columns still reads. Any column not recognised is listed, and kept with each row as its raw data;
- the first 5 niches, parsed and scored.

**Import** saves them. Importing the same category again replaces it, and a niche whose customer need matches keeps its status, notes, shape and incumbent check.

**Duplicates.** Opportunity Explorer often lists the same niche under two names ("window cleaner" and "window cleaning equipment": the same three search terms, the same search volume). The first is kept, and the other shows under it as "also: …".

**The same niche in several categories.** A niche can be in more than one category's download (pool heater is in DIY & Tools and Garden). It's one row, with every category it appeared in shown as chips under its name; filtering by a category shows it under each. When two rows merge, the one kept is the one with a candidate, else the one furthest along (shortlisted before new, new before dismissed), else the older one; it gets every category and alias, both rows' notes, the shape and incumbent check, and the Keepa tokens both spent. Re-importing a category doesn't remove a niche that's also in another: it just drops this category from its chips if the new file no longer has it.

## The score (0–100)

Every niche is scored from Opportunity Explorer's own figures. Open a niche (the arrow by its name) to see each part and its points.

| Part | Points | Reads | Full points | None |
|---|---|---|---|---|
| **Demand** | 20 | Search volume over 360 days, on a log scale | 2M+ searches | 100k or fewer |
| **Growth** | 20 | Search volume growth over 180 days | +5% to +60% (0–5%: 0.8; over +60%: 0.6) | −50% or less (a straight line from 0%), or over +150%: a spike |
| **Price** | 20 | Average price | £15–40 (£10–15 and £40–60: 0.6; £8–10 and £60–80: 0.3) | Under £8 or over £80 |
| **Fragmentation** | 25 | Number of top-clicked products: more products sharing the clicks means no one owns the niche | 60+ | 15 or fewer |
| **Units** | 15 | Units sold a year by the average product (the midpoint of Amazon's range) | 2,000+ | 300 or fewer |

Scores of 60 and over are green. Growth and return rate are shown as percentages; the file holds them as fractions.

## The flags

Flags never change the score: they're chips, and you can hide flagged niches. The default view hides **Spike**, **Big brand**, **Electrical**, **Heavy/bulky** and **Regulated** (the **Hide flagged** chips; **defaults** puts them back).

| Flag | When | Why it matters |
|---|---|---|
| **Spike** | Growth over +150% in 180 days | A one-off (eclipse glasses before an eclipse, a heatwave): the demand won't last |
| **Fading** | Growing over 180 days but down more than 15% over 90 | The trend has turned |
| **Low price** | Average price under £10 | Fees leave little margin |
| **High returns** | Return rate 3% or more | Returns eat the margin and the rating |
| **Electrical** | A word like camera, plug, charger, battery, LED, heater, extension lead, lamp, light, drill, smart, sensor, bulb, steamer, clippers, toaster, kettle, air fryer, hairdryer, straightener, trimmer, shaver, scales, thermometer, fountain… | Safety testing, certification and returns |
| **Regulated** | glasses, safety, PPE, mask, medical, baby, food, supplement, fire, gas, smoke, paint, aerosol, resin, adhesive… | Rules, testing or dangerous-goods handling |
| **Big brand** | A brand as a whole phrase in the customer need or a search term (Tapo, Ring, DeWalt, Bosch, Karcher, WD-40…): the term is the brand, starts with it ("tapo camera", "ring doorbell"), or has it after a space when the brand is 5+ characters ("cordless dewalt drill"). So "key ring" isn't Ring | Shoppers search for the brand, not the product. The list is editable in [Settings → Private label](/settings?tab=pl#brand-terms); saving re-flags every niche |
| **Heavy/bulky** | shelves, shelving, unit, cupboard, drawers, ladder, toilet, wardrobe, mattress, desk, door, gate, fence, rack, trolley, flooring, lounger, hammock, swing, and a plant, TV, monitor or bike stand (not any stand)… | Oversize FBA fees and freight |
| **Low units** | The average product sells under 200 a year | Too little volume to be worth a launch |

Words match whole (so "led" isn't found in "sledge"), plurals included ("light" finds "lights"). A word can still misfire ("unit" in "air con unit", "scales" in "fish scales"): open the niche to judge.

## Acting on niches

Open a niche for its actions:

- **Shortlist**, **Dismiss** (and **Reset**). Tick several rows for **Shortlist** or **Dismiss** in bulk.
- **Notes**: saved when you click away.
- **Check incumbents (Keepa)**: who already sells the niche's first search term, on-niche only.
  - **In the niche's category.** One Product Finder page of best sellers in the Keepa root category of each category the niche came from (Sports & Outdoors, Pet Supplies and so on), with the term's words in their titles. The top 25 are detailed for title, reviews and monthly sales.
  - **On-niche titles only.** A product counts only when its title has the whole term as a phrase (its words in order, plurals allowed), none of the **off-niche words** (toy, kids, baby, game, cat, dog, card, gift, tube, tubing, sleeve, spare, replacement, part and so on; edit them in Settings → Private label), and isn't an accessory ("bag for fishing rod"). Cat and dog are allowed in a pet niche (Pet Supplies, or a pet word in the term), and a word the term itself uses never excludes. What was left out, and why, is listed under the check.
  - **The top 10 by sales.** The on-niche products are ranked by monthly sold (sales rank for those without one), and the 10 best decide the **shape**: **open** (nobody over 1,000 reviews), **contested** (one), **dominated** (two or more, or one over 5,000). Each shows its reviews, monthly sold, price and Keepa category, so you can see they're the real thing.
  - **Cost.** Up to about 61 tokens; ASINs detailed in the last 7 days are reused. Before it runs, it shows the cost against your balance, with 100 kept in reserve. One check at a time, and never while a Niche Hunt is running. The tokens count in Home's Private label tokens this month.
  - **Rerun check** (once a niche has been checked) runs the classification again on the same 25 products: no Product Finder call within 7 days, and only the products not detailed in the last 7 days are fetched again, so it's often free. Use it after editing the off-niche words.
- **Create candidate**: a Private label candidate named after the customer need, its first search term as the niche keyword, and the category's fee category (shown next to the category picker), with the niche's figures in its notes. The niche shows as **candidate** and links to it.

**Filters**: category, minimum score, price band, status (dismissed niches are hidden unless asked for), and a search over customer needs, search terms and aliases. Every column sorts, and the sort is remembered. The strip on top counts the niches imported, those scoring 60+, those hidden by the flags, the shortlist and the incumbent-checked.

## The workflow

1. Import several categories.
2. Sort by score with the default flags hidden.
3. Shortlist about 10.
4. Run the incumbent check on the shortlist only (up to about 61 tokens each).
5. Create candidates for the **open** and **contested** ones.
6. Open each niche in Opportunity Explorer with the extension loaded and **Send to Private label**: its capture fills the candidate's Gates 3 and 5 (search volume, click share, conversion, search terms). See [Private label](/help/pages/private-label).
