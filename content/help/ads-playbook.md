---
title: "Ads: the playbook"
summary: Start to finish, how to run Sponsored Products with this app, from setting a product up to the weekly loop, the 60-day arc, the monthly review and what to do when something looks wrong, with the dog seat belt 2-pack as the worked example.
synonyms: [playbook, ads guide, how to run ads, sponsored products guide, weekly routine, ppc, start here, ads workflow, launch to steady]
workspace: ads
order: 0
---
This is the whole job, in the order you do it. The worked example is the **dog seat belt 2-pack** (ASIN B0H9ZH3RV5, launching at £13.99 with a 30% launch target and £10 a day). Every page name links to the page.

## 0. The idea

The ads are there to buy sales the listing can't yet win organically, at a cost the margin can carry, and to buy the sales history that earns organic rank. The app turns what you import from Amazon Ads into proposed changes, each with its reason in real numbers. You approve them, download one bulk sheet and upload it in Amazon Ads. Nothing changes in your account until you do. Each product has its own price, costs and target; each week you import, read three numbers, work through [Proposals](/ads/proposals), and upload. Over about 60 days a product moves from launch (harvest search terms, accept a high ACoS for rank) to steady (bids that hold the target), and later, once organic sales carry it, to TACoS mode.

## 1. Set up the product

On the [Dashboard](/ads/dashboard), open the product and click **Price, costs and target**.

- **Sale price.** Blank uses Keepa's Buy Box, else the ads' average sale price. For the 2-pack, type **£13.99**: there are no ad sales yet to average.
- **Landed cost a unit** (what each one costs you delivered to Amazon). Without it there's no break-even and no profit figure: the 2-pack has none yet, so set it first.
- **Package size and weight** (or **Size and weight from Keepa**, 1 token) for the FBA fee.

**Break-even ACoS** = margin before ads ÷ price: spend more than that on ads per ad sale and each one loses money. As an example (your figures will differ), fees of £5.50 and a £3.00 landed cost leave a £5.49 margin on £13.99: break-even 39%. See [Ads: importing reports](/help/howto/ads-importing-reports#the-dashboard).

**Launch and steady targets.** The **launch** target can sit near break-even (you're buying rank, so profit can be thin); the **steady** one well under it (profit is the point). The 2-pack launches at 30%. **Recommend** (under the same panel) asks Claude for both targets from break-even, reviews, rank, stock cover and the account's conversion, with a paragraph of reasoning; **Apply** writes them. It costs about a penny. See [Ads: AI review](/help/howto/ads-ai-review#recommend-targets).

**Whitelist and blacklist** ([Settings → Ads → Keyword lists](/settings?tab=ads#keyword-lists), for the account or the product). The whitelist is terms never negatived or paused: your brand, and the 2-pack's exact head terms ("dog seat belt", "dog car seat belt"). The blacklist is words that never fit: for a seat belt, perhaps "cat", "human", "replacement buckle". They go into every new campaign as negative phrases. See [Ads: rules and proposals](/help/howto/ads-rules-and-proposals#the-rules).

## 2. Launch

On [Launch](/ads/launch), pick the product (or come from a private-label candidate's launch checklist, which fills the head terms and competitors).

- **Head terms**: the 2-pack's five ("dog seat belt", "dog car seat belt", "dog seatbelt for car", "pet seat belt", "dog car harness seat belt"). Without a candidate they come from the [Keyword bank](/ads/keywords).
- **Competitor ASINs**: page-one listings to target on their product pages. The 2-pack has none, so its product-targeting campaign is left out: add a few.
- **Daily budget**: £10 for all the campaigns together.
- **Starting bid**: the higher of target × price × smoothed conversion and the account CPC × 0.8. For the 2-pack, £0.44.
- **Negative phrases**: the blacklist, filled in.

The four campaigns (three for the 2-pack):

| Campaign | Targets | Bid | Budget share |
|---|---|---|---|
| **Auto** | Amazon matches close-match and substitutes | × 1.0 (£0.44) | 30% (£3.33 for the 2-pack, with PT left out) |
| **Broad** | The head terms, broad | × 0.8 (£0.35) | 20% (£2.22) |
| **Exact** | The head terms, exact | × 1.0 (£0.44) | 40% (£4.44) |
| **PT** | Competitor ASINs | × 0.9 | 10% |

**Create launch sheet** makes one bulk sheet (a batch on [Proposals](/ads/proposals)) and saves the 60-day plan. Download it, then in Amazon Ads go to **Campaign manager → Bulk operations → Upload** and upload it; back on Proposals, **Mark uploaded**. The 2-pack's sheet was made with the placeholder SKU `REPLACE-WITH-2PACK-SKU`: re-create it with the real SKU before uploading. See [Ads: launching a product](/help/howto/ads-launching-a-product).

**Pause Amazon's own campaigns.** When you list a product, Seller Central often offers (or creates) a default auto campaign. Pause it in Amazon Ads: it competes with the launcher's Auto campaign for the same searches and muddies the data.

## 3. The weekly loop

**Import.** In Amazon Ads, download the **bulk export** for the last 60 days (with search term data) and, if you can, the **daily Campaign report** for the last 30; drop both on [Imports](/ads/imports). See [Ads: importing reports](/help/howto/ads-importing-reports).

**Read three things on the [Dashboard](/ads/dashboard)**, in this order:

1. **Listing health.** Amber means the listing (images, price, title) is the problem, not the bids: fix that first. More bid on a listing that doesn't convert buys more clicks that don't convert, so Bid up is held back meanwhile.
2. **Profit after ads**, then **TACoS** and **organic share** on the tile. Negative profit with ACoS under target means the target is above break-even, or a cost is missing.
3. **Days of cover** (the stock chip). Under 10 days the stock guard will slow the ads; under 3 it pauses them.

**Then [Proposals](/ads/proposals), rule by rule.** Each proposal shows the current and proposed value, its reason with the figures used, and a confidence.

| Rule | How to treat it |
|---|---|
| **Negative**, **Pause** | Approve. A search term with no order after 15 clicks or half the price spent is waste. Check one isn't a term you're deliberately buying for rank (whitelist those). |
| **Harvest** | Approve. A converting term gets its own exact bid, and a negative where it was found so the two don't buy the same clicks. |
| **Bid down** | Approve, unless you're buying rank on that keyword during launch. The new bid is the one that hits the target at its smoothed conversion. |
| **Bid up**, **Budget** | Approve when the product is profitable after ads. They need the daily Campaign report. |
| **Placement** | Approve. It only raises a placement that's both better than its campaign and itself near the target. |
| **N-gram negative / winner** | Read the examples in the reason ("cat" in "cat car seat belt", "cat harness belt"…): one word wasting across several terms. Check the word can't be part of a good term, then approve. See [N-grams](/ads/ngrams). |
| **Stock guard** | Approve: it slows the ads before stock runs out, and proposes restoring the old values once stock is back. |
| **Ranked — ease off** | Approve once organic rank is page one: the ad pays for a slot the listing already holds. |

**Confidence** is high from 30 clicks or 3 orders, medium from 10 clicks, low under 10. Low-confidence bid changes can wait a week.

**Export → upload → mark uploaded.** **Export approved** makes one bulk sheet (a batch). Upload it in Amazon Ads (Bulk operations → Upload), then **Mark uploaded** on the batch, so the same changes aren't proposed again for 30 days. **Revert** on a batch makes a sheet that puts back the values from before it. See [Ads: rules and proposals](/help/howto/ads-rules-and-proposals#exporting-and-uploading-the-bulk-sheet).

**Rank checks every 2–3 weeks.** With the extension, run the rank check for the product's keywords. On 2 Oct the 2-pack wasn't in the top 48 for "dog seat belt", "dog car seat belt" or "pet seat belt": the baseline. Ranked and Slipping act on the trend. See [Ads: rank checks](/help/howto/ads-rank-checks).

## 4. The 60-day arc

| When | What |
|---|---|
| **Weeks 1–2** | Harvest and negatives only: the rules hold bid changes back while the campaigns gather data at the launch target. |
| **Weeks 3–4** | First bid-downs: keywords with 10+ clicks far over the target come down. |
| **Week 5** | Lower the launch target by 5 points (for the 2-pack, 30% → 25%) on Price, costs and target. |
| **Week 8** | Switch the phase to **steady**: the steady target applies. |
| **Later** | When organic sales are over half for 30 days and there are 30+ reviews, the tile suggests **TACoS mode**: switch it on Price, costs and target. See [Ads: TACoS mode](/help/howto/ads-tacos-mode). |

The plan's steps show on the product's section of the [Dashboard](/ads/dashboard).

## 5. Monthly

- **[Review](/ads/review)**: the AI monthly review, per product and account-wide, whether last month's uploaded batches worked (14 days before against 14 after), and three recommendations ranked by profit, each mapped to a rule. It costs a few pence. **Explain this product** on the dashboard gives a short read of one product's period.
- **Amber figures** under an AI answer are numbers that aren't in the data sent: check them before acting on them.
- **[Stock → Reorder](/stock/reorder)**: when each item needs ordering, so the ads never run into a stock-out.

## 6. When something looks wrong

| Symptom | Likely cause, and what to do |
|---|---|
| **High ACoS everywhere, CTR fine, conversion low** | A listing problem (listing health is amber). Fix the main image, price or title; bids won't fix it. |
| **Spend nowhere near the budget, few impressions** | Bids too low for the searches (raise the starting bid or let Bid up act), or campaigns paused, or Amazon's default campaign taking the auctions (pause it). |
| **Profit after ads negative though ACoS is under target** | The target is above break-even, or a cost is missing (landed cost, size). Set the target below break-even; use **Recommend**. |
| **A search term in two campaigns, both paying** | The harvest's negative exact wasn't uploaded: approve the harvest's negative, or add the term as a negative from the [Keyword bank](/ads/keywords). |
| **Proposals empty, or a rule silent** | No fresh import, or a rule can't check: **What the rules couldn't check** on [Proposals](/ads/proposals) and the notes on [Rules](/ads/rules) say why (a missing price, no daily report, an import longer than the rule's window). |

## 7. What changes with the Amazon Ads API

The API is pending approval. Once connected:

- Reports and entities are pulled automatically: no exports to import.
- Rules set to **Auto** apply their changes directly; no bulk sheet to upload.
- Daily and hourly data per keyword: each rule's window becomes exact, Bid up reads impression share, Revive sees a keyword gone quiet inside a busy campaign, and Budget sees when in the day it runs out.

Until then, this weekly loop is the job, and it takes about 20 minutes.
