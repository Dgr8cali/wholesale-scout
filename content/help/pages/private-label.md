---
title: "Private label: how Gatekeeper works"
summary: Should ~£1,000 launch your own product into a niche? Eight gates, a 10-line scorecard and a verdict, with Keepa and Opportunity Explorer filling most of the numbers.
synonyms: [gatekeeper, private label, pl, own brand, product launch, niche research, opportunity explorer, poe, scorecard, launch budget]
route: /pl
order: 7
---
Private label answers one question: should you spend about £1,000 launching your own product into this niche? It is Gatekeeper, moved into Wholesale Scout, with two changes to the fees so they agree with the rest of the app: storage carries VAT and the digital services fee, and peak rates follow the calendar (see [Gate 6](#gate-6-unit-economics-the-rate-card-then-you)). A candidate must clear **every gate** and **score well**. A good score never overrides a failed gate.

You used to type about 45 numbers per candidate from Jungle Scout, Keepa and Seller Central. Here Keepa and the Chrome extension fill most of them. Jungle Scout isn't used.

## The page

Private label is one of the app's three workspaces (switch at the top of the sidebar). Its pages are **Candidates** (below), **Niche Hunt**, which proposes niches that already pass Gates 0 and 1 and turns one into a candidate (see [Niche Hunt](/help/concepts/niche-hunt)), **Quotes**, where supplier quotes become a landed cost that feeds Gates 0 and 7 (see [Private label: quotes and landed cost](/help/howto/pl-quotes-and-landed-cost)), and **Launch**, the checklist from samples to the first review (see [Private label: launch checklist](/help/howto/pl-launch-checklist)). Each candidate also has its Quotes and Launch sections under its scorecard. The old /private-label address still works: it opens Candidates.

- **Candidates** (left): each candidate with a dot in its verdict colour, its score (or how many of the 10 lines are scored, e.g. `6/10`), its status (draft, researching, samples, dropped, launched) and when Keepa last refreshed it; once there's a landed cost, the cost per unit (from the chosen quote when there is one), the price multiple in its band colour, and the next launch step.
- **The workspace** (right): the selected candidate's header, the eight gates in order, the scorecard and the verdict.
- **New candidate** asks for a name, a niche keyword, a referral category and up to ten ASINs from page one of the niche. Paste them one per line or comma-separated. The first is the **reference listing**. Keepa is fetched when you save.

In the header you can rename the candidate and change its niche keyword, referral category and status. **Edit** changes the ASIN list; saving it refreshes from Keepa. **Refresh from Keepa** fetches again (see [What it costs](#what-it-costs)). The header also shows how many gates are clear, the score out of 30 and the verdict.

## Where each number comes from

Every field filled automatically shows a small chip:

| Chip | Meaning |
|---|---|
| **Keepa** | Filled from Keepa when you saved or refreshed. |
| **POE** | Filled from an Opportunity Explorer niche you sent with the extension. |
| **POE (derived)** | Worked out from that niche's data because Opportunity Explorer doesn't state it (see Gate 3's search conversion). How it was worked out shows under the field. |
| **Fees** | Worked out from the rate card (Gate 6's fee readouts). |
| **Manual** | Typed by you. |

An automatic field is read-only, with the figures it came from underneath it. Click **edit** to make it yours: it becomes **Manual**, and no refresh or capture will overwrite it. Clear a manual field to hand it back: the next refresh or capture fills it again.

### Gate 0: Your filter (Keepa, then you)

- **Sell price**: the median page-one price. A listing's price is its Buy Box price, or its lowest new offer when the Buy Box wasn't fetched.
- **Packed weight, length, width, height**: the reference listing's package from Keepa. Overwrite them with your own product's if they differ.
- **Landed cost** is yours to type. So are seasonal, avoid category, simple and differentiable.

### Gate 1: Find the market (Keepa, every ASIN)

| Field | How it's filled |
|---|---|
| Reviews on page one | From the review counts: most over 1,000; else most 500 or more; else, when two or more listings under 200 reviews each sell 150+ a month, "several under 200 selling well"; else "most 200–500". "Most" means more than half. |
| Average rating | The mean of the listings' star ratings. |
| Top-10 monthly sales, each | The median of the listings' sales a month. A listing's sales follow the wholesale rule: a fast seller (90-day average rank under 5,000) uses Amazon's bought-in-past-month, because rank drops undercount it. Otherwise it's the highest of rank drops (90-day ÷ 3), Keepa's 30-day drops and bought-in-past-month. |
| Top 3 revenue share | The top three listings' share of the listings' summed monthly sales. With three ASINs or fewer this is always 100%, so add more. |
| Amazon-brand in top 10 | Yes when any listing's brand is one of Amazon's own (Amazon Basics, Amazon Essentials, Solimo, Presto!, Umi, Eono, Amazon Aware, Happy Belly, Wag, Pinzon, Rivet, Stone & Beam). |
| Price spread holds £18–35 | Yes when 70% or more of the prices sit within the band widened by 20% (£14.40–£42.00). |

### Gate 2: Validate history (Keepa, the reference listing)

| Field | How it's filled |
|---|---|
| Sales rank, 12 months | The year's rank in twelve 30-day months. A month over 5× the median is left out (out of stock, or before it sold). One month far better than the rest is a **spike**. Months that swing widely with no straight-line trend are **seasonal**. A last-three-months rank over 1.5× the first three's is a **decline**; under 0.67× is **growing**. Anything else is **flat**. The figures show under the field. |
| Rank drops / month | Keepa's 90-day rank-drop count ÷ 3. |
| Bought in past month | Amazon's figure, via Keepa. Blank when Amazon doesn't show one. |
| New offer count | **Climbing** when the last 90 days average 1.5× the first 90 days of the year and at least two more offers. Otherwise **steady**. |
| Buy Box price | **Sliding** when the last 90 days' median is under 90% of the first 90 days' median. Otherwise **holds**. |
| Amazon ever a seller | Yes when Keepa's Amazon price history has any offer. |

### Gate 3: Amazon's own data (the extension)

Search volume (360 days), growth, products in the niche, top-3 click share, search conversion and average units per product. These come from an Opportunity Explorer niche you send with the extension (see [Capturing Opportunity Explorer](#capturing-opportunity-explorer)). **Search volume growth** is Opportunity Explorer's "Growth past 180 days" (for example +5.92%), with "Growth past 90 days" shown under the field. Over +5% is growing, under −5% declining, otherwise flat. Without a 180-day figure the 90-day one is used. Without either, growth is worked out from the niche's weekly search volume, the last 52 weeks against the 52 before (**POE (derived)**). Search volume itself is the 360-day figure. Average units sold per product comes as a yearly range (for example 3,000–4,000); the midpoint is used, a month.

**Search conversion** isn't given as a single niche figure. When Amazon's niche summary has one, it's used (**POE**). Otherwise it's worked out (**POE (derived)**):

1. From the niche's own weekly search conversion over the last 52 weeks, each week weighted by its search volume. This is the niche-level figure Opportunity Explorer charts week by week.
2. If the capture has no weekly trend, from its search terms: each term's 360-day conversion weighted by its 360-day search volume. This covers only the terms in the capture, so it can read lower than the niche as a whole.

The niche summary's "purchase conversion post-launch" is a different measure (products launched in the last 90 days) and isn't used.

### Gate 4: Mine the reviews (you)

This gate is still by hand. To make the read faster, the gate lists the top five ASINs with their rating, review count and a link to Amazon's **critical reviews** (the 1–3★ ones). Keepa has the rating and review count but not the count per star, so the link is how you get to them.

### Gate 5: Keywords (the extension, then you)

From the same Opportunity Explorer niche: **Head term volume** is the top search term's searches a month, and **Terms with 300–2,000 volume** counts the search terms in that range. The gate lists the niche's top search terms, with the long-tail ones highlighted. Volumes over 90 or 360 days are turned into a month's. Bids and sponsored slots aren't in Opportunity Explorer. Type them from Seller Central's campaign manager.

### Gate 6: Unit economics (the rate card, then you)

Gatekeeper's economics, using the app's rate card (Amazon UK FBA, July 2026: the same card Gatekeeper carried). The FBA fee comes from the size tier and weight band (parcels bill on dimensional weight when it's heavier), with the low-price rate at £20 and under (£10 for Beauty, Health and Personal Care, Office and Grocery). Referral comes from the category. Storage comes from the volume and your months in storage. VAT and the digital services fee are added to referral, FBA and storage, as on every other page that works out fees. Inbound, prep and returns are added as they are.

**Peak rates** apply automatically in October, November and December, as in screening: the peak storage rate (£0.82 instead of £0.62 per cubic foot a month) and the small-parcel peak surcharge (£0.11). Gate 6 shows **Peak rates in effect (Oct–Dec)** while they do. A product priced at the low-price rate keeps it in the peak months.

Without packed dimensions and weight there's no FBA fee: the tier says **Enter dimensions and weight in Gate 0** instead of assuming a size. Profit and margins stay blank until they're in.

You type **landed cost** (Gate 0), or write it from a supplier quote (Quotes, chip **Quote**; a value you type yourself still wins). **Ads per unit** has a derived default until you type one (chip **Derived**, with the formula under the field): at launch, CPC ÷ conversion, where the CPC is Settings → Ads's (£0.60 to start, then the account's trailing CPC once [ads reports are imported](/help/howto/ads-importing-reports)) and the conversion is the candidate's Gate 3 search conversion, else 7%; at steady state, 40% of launch. Click **edit** to type your own. **FBA fee override** replaces the rate-card fee with Amazon's own figure.

### Gate 7: Launch budget (you)

First order units, samples, inspection, photography, trademark and launch ads. A 10% buffer is added. It must fit your budget.

## Gates, scorecard and verdict

Each check in a gate is **pass**, **warn**, **fail** or empty (not answered yet). A gate takes its worst check. It passes only when every check passes. The thresholds are Gatekeeper's. For example, the sell price passes at £18–35 and warns at £15–40; landed cost passes at 30% of the sell price or less and warns at up to 35%.

The **scorecard** has 10 lines worth 0–3 points each, 30 in all: review depth, demand (rank drops), demand stability, Opportunity Explorer volume, review-driven differentiation, long-tail keywords, price multiple, steady-state margin, launch fits capital and competitive risk. Four lines are **structural**: review depth, demand stability, price multiple and competitive risk. Trying harder can't fix them.

The **verdict** appears once all ten lines are scored:

| Verdict | When |
|---|---|
| **Order samples** | 24 or more with no gate failed. |
| **Strong score, but a gate failed** | 24 or more, but at least one gate failed. Fix the gate or drop it. |
| **Samples only if you can move the weak lines** | 18–23, and the weak lines (1 point or less) aren't structural. |
| **Drop it** | 18–23 with a weak structural line, or under 18. |

### Waiving a gate

Sometimes a check fails for a reason that doesn't apply to you. Every failed or warned check has **Waive**, and a failed or warned gate has **Waive gate** in its header. Either asks for a one-line reason, which is required. A waived check counts as a pass for its gate. The row keeps its own colour, struck through, with a **Waived** chip (the reason shows on hover). A waived gate shows **Waived** in its header.

Waive only when you know why the rule doesn't fit this product. For example:

- **Not in an avoid category**, when you already hold the compliance documents (test reports, a responsible person, the right labelling) for that category.
- **Sell price £18–35**, when you're deliberately testing a higher-ticket product and have checked the economics in Gate 6.

A waiver never hides anything. The verdict card always adds a line such as "2 checks waived: Sell price £18–35, Not in an avoid category". The candidate list shows a small waived count next to the score, and a **Waivers** section at the bottom of the candidate lists every waiver with its reason and date. **Remove waiver** on a row, a gate header or that list takes it back. Scorecard lines can't be waived: they're the score, not a gate. A waiver on a check follows it when you change a threshold in Settings (for example "Sell ÷ landed ≥ 3.5×" becoming 4×). It stops mattering once the check passes on its own; the Waivers list says when.

The thresholds and cost assumptions (budget, VAT, digital services fee, inbound, prep, storage months, returns, and the Gate 6 floors) are under [Settings → Private label](/help/pages/settings#private-label-tab).

## What it costs

Saving a candidate or clicking **Refresh from Keepa** fetches every ASIN without a snapshot under 7 days old. A snapshot taken for any candidate counts. Fetching costs about 3 tokens for the reference listing, which includes its Buy Box history, and 1 for each other ASIN, plus up to 1 each for the rating and review count. Ten ASINs come to roughly 20 tokens. The tokens are counted on the candidate and in Home's Keepa spend. See [Keepa tokens](/help/concepts/keepa-tokens). The snapshots also go into the wholesale history, so a later run can reuse them.

## Capturing Opportunity Explorer

The extension reads a niche **only when you ask it to**:

1. In Seller Central, open **Growth → Product Opportunity Explorer** and open the niche.
2. The extension watches the niche data the page itself loads from Amazon. It doesn't read the page's text, click anything or fetch anything on its own.
3. Once a niche has loaded, a **Wholesale Scout · Private label** panel appears at the bottom right with **Send to Private label**. Nothing is sent before you click it. Nothing is scheduled. Closing the tab forgets the capture.
4. On **Send to Private label**, the niche goes to the app. If a candidate's niche keyword equals the niche's title (ignoring case and spaces at the ends), it attaches there and fills Gates 3 and 5. Otherwise the panel lists your candidates to pick from.

Only sellercentral.amazon.co.uk is on by default. The popup's **Opportunity Explorer on .com and .de too** option adds the US and German Seller Central. Every capture is kept with the raw data Amazon sent, so a correction to how it's read can be applied later. See [Chrome extension](/help/pages/extension#opportunity-explorer-capture).
