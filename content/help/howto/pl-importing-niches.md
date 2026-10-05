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

## Search-term conversion (from the extension)

The category download has no conversion figures. Open a niche on Opportunity Explorer and click the extension's **Send to Private label**: the capture holds every search term's 360-day conversion. The niche whose customer need (or an alias) is the captured niche's title gets:

- a **Best term conv.** column: the highest conversion among its search terms (sortable);
- a chip: **Buying** when a term converts at 4% or more (people search it to buy), **Browse-only** when no term reaches 2.5% (people look but don't buy). Between 2.5% and 4%, no chip;
- a **Term conversion** line under the score in the opened niche, with every captured term's conversion and volume. It reads only: the 0–100 score doesn't change.

The latest capture wins. A capture sent before the import is linked when you import. A candidate filled from the same capture gets a **Best search-term conversion** field in Gate 3 and a reads-only line on its scorecard.

## Acting on niches

Open a niche for its actions:

- **Shortlist**, **Dismiss** (and **Reset**). Tick several rows for **Shortlist** or **Dismiss** in bulk.
- **Notes**: saved when you click away.
- **Check incumbents (Keepa)**: who already sells the niche's search terms, on-niche only.
  - **In the niche's category.** One Product Finder page of best sellers for each of the niche's search terms, in the Keepa root category of each category the niche came from (Sports & Outdoors, Pet Supplies and so on). A term that contains another is skipped, since the shorter one's search already finds it ("tackle box" covers "fishing tackle box"), and at most 3 pages are run. The terms' best sellers are taken in turn up to 25, which are detailed for title, reviews and monthly sales.
  - **Found outside the category.** Amazon doesn't always file a niche where Opportunity Explorer puts it (hedgehog houses are a Garden niche but sit under Pet Supplies and wildlife). When the category search turns up fewer than 5 products, the same search runs again on all of Amazon, with the same on-niche rules, and the result is labelled **found outside Garden** (or whichever category). Either way, chips under the result show the Keepa categories the on-niche products are filed under, with how many in each. The confirmation shows this possible extra cost (11 tokens a search term).
  - **On-niche titles only.** A product counts only when its title has **any** of the niche's search terms, either as a phrase (its words in order, plurals allowed) or with all its words within 4 words of each other in any order ("Ball Launcher Dog Toy" holds "dog ball launcher"). The term it matched is shown beside it, marked **(any order)** when it wasn't the phrase; a phrase match is preferred when there is one. It must also have none of the **off-niche words** (toy, kids, baby, game, cat, dog, card, gift, tube, tubing, sleeve, spare, replacement, part and so on; edit them in Settings → Private label), and must not be an accessory for **any** of the niche's terms: "for", "fits", "fit", "fitting" or "compatible with" just before one of them, with at most two small words between ("bag for fishing rod", "inserts, fits most tackle boxes", "strap compatible with all fishing bags"). For a bag or box niche (a term ending in bag or box), products Keepa files under **Locking Carabiners** or **Bait Storage** are left out too, and so are titles with "dry" (a dry bag isn't a fishing bag; a niche whose term has "dry" in it keeps them). Cat, dog, toy and game are allowed in a pet niche (Pet Supplies, or dog, cat or pet in any of its search terms: a dog ball launcher is a dog toy); kids and children in a Baby Products or Toys & Games niche; baby in a Baby Products niche; toy and game in a Toys & Games niche. A word the term itself uses, or its plural, never excludes. What was left out, and why, is listed under the check.
  - **The top 10 by sales.** The on-niche products are ranked by monthly sold (sales rank for those without one), and the 10 best decide the **shape**: **open** (nobody over 1,000 reviews), **contested** (one), **dominated** (two or more, or one over 5,000). Each shows its reviews, monthly sold, price and Keepa category, so you can see they're the real thing.
  - **Cost.** Up to about 83 tokens (11 a finder page, about 2 a product detailed), less when the terms overlap; ASINs detailed in the last 7 days are reused. Before it runs, it shows the cost against your balance, with 100 kept in reserve. One check at a time, and never while a Niche Hunt is running. The tokens count in Home's Private label tokens this month.
  - **Rerun check** (once a niche has been checked) runs the classification again on the same products: no Product Finder call within 7 days, and only the products not detailed in the last 7 days are fetched again, so it's often free. Use it after editing the off-niche words.
- **Create candidate**: a Private label candidate named after the customer need, in the category's fee category (shown next to the category picker), with the niche's figures in its notes. It starts with what the niche already knows:
  - **Page-one ASINs (Gate 0)**: the incumbent check's on-niche top 10 by sales, best seller first (the reference). No check yet: add them yourself.
  - **Niche keyword**: the captured search term converting best, when the niche was sent from Opportunity Explorer; else its first search term.
  - **Sell price (Gate 0)**: the niche's average price, until a Keepa refresh fills the Buy Box price (a value you type is never overwritten).

  The niche shows as **candidate** and links to it. A niche that already has a candidate opens it unchanged.

**Filters**: category, minimum score, price band, status (dismissed niches are hidden unless asked for), and a search over customer needs, search terms and aliases. Every column sorts, and the sort is remembered. The strip on top counts the niches imported, those scoring 60+, those hidden by the flags, the shortlist and the incumbent-checked.

## The workflow

1. Import several categories.
2. Sort by score with the default flags hidden.
3. Shortlist about 10.
4. Run the incumbent check on the shortlist only (up to about 83 tokens each).
5. Create candidates for the **open** and **contested** ones.
6. Open each niche in Opportunity Explorer with the extension loaded and **Send to Private label**: its capture fills the candidate's Gates 3 and 5 (search volume, click share, conversion, search terms). See [Private label](/help/pages/private-label).
