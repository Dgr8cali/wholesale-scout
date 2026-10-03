---
title: "Ads: keyword bank"
summary: One place per product for every search term worth knowing (Opportunity Explorer, harvested, n-gram winners, rank-tracked, your own), with what the ads made of each, and Add as exact, Add as negative and Track rank.
synonyms: [keyword bank, keywords, search terms, opportunity explorer terms, head terms, add as exact, add as negative, track rank, keyword research]
workspace: ads
order: 6
route: /ads/keywords
---
**Ads → Keywords** (and **Keyword bank** under each product on the dashboard) keeps every term worth knowing for a product in one table.

## Where its terms come from

| Source | What |
|---|---|
| **Opportunity Explorer** | The search terms from the linked private-label candidate's Gate 5 capture, with their searches a month. A product is linked to its candidate from the candidate's Launch section (the listing ASIN). |
| **Harvested** | Terms the Harvest and N-gram winner rules proposed, whatever happened to the proposal. |
| **N-gram winner** | Words and word pairs selling at or under the target across several terms (Rule 10). |
| **Rank tracked** | Terms with rank checks, or added to the rank checks. |
| **Added by you** | Type terms (one a line, or commas) and **Add**; the cross removes one of yours. |

The same term from several sources is one row: terms are matched by their normalised text ("Pill-Box" and "pill box" are the same).

## The columns

**Searches/mo** (Opportunity Explorer's), **Our clicks**, **Orders** and **ACoS** (the product's search terms over everything imported), **Organic rank** (the latest check; ">48" when it wasn't in the top 48), and **Status**:

| Status | When |
|---|---|
| **targeted exact** | An exact keyword in one of the product's campaigns |
| **targeted broad** | A broad or phrase keyword |
| **negatived** | A negative exact for it, or a negative phrase inside it |
| **not targeted** | None of those |

Every column sorts.

## Acting on terms

Tick terms, then:

- **Add as exact**: an exact keyword in the product's Exact campaign, at the bid for the target ACoS at the term's smoothed conversion (its own clicks and orders, pulled towards the product's; see [Ads: rules and proposals](/help/howto/ads-rules-and-proposals#the-rules)).
- **Add as negative**: a campaign-level negative exact in each of the product's broad and auto campaigns that lack it.
- **Track rank**: added to the [rank checks](/help/howto/ads-rank-checks).

**Add as exact** and **Add as negative** are queued on **Ads → Proposals** as already approved (you chose them), and go out with the next bulk sheet. A term already exact, already negatived or already queued is skipped, and the message says so.

## The launcher

The [launcher](/help/howto/ads-launching-a-product)'s head terms come from the bank when a candidate doesn't give them: Opportunity Explorer's biggest first, then what sells, then yours, leaving out negatived terms.
