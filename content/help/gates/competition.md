---
title: Competition shape
summary: Checks the number of FBA sellers, whether one seller dominates the Buy Box, and flags likely brand distributors.
synonyms: [sellers, fba sellers, offers, buy box share, brand lock, distributor, competitors]
gate: competition
order: 7
---
Competition shape checks that a listing has a healthy number of sellers: enough to show others can sell it, not so many that your share is tiny, and no single seller holding the Buy Box most of the time.

## What it checks

- **FBA seller count**: under **Min FBA sellers** or over **Max FBA sellers** trips the gate. Before Keepa this is Amazon's FBA offer count, not counting Amazon's own offer; with Keepa history it's Keepa's FBA count (or all offers when that's missing).
- **Top-seller Buy Box share**: one seller held the Buy Box more than **Max top-seller Buy Box share** of the past year. This needs Keepa's Buy Box seller data, which is only fetched (3 tokens) for rows that pass every gate on the cheaper history.
- **Likely brand distributor**: for rows that pass every gate, the top Buy Box sellers' Keepa profiles are looked up. A seller whose storefront is at least **Distributor when brand is at least** % this product's brand is flagged. On its own this only ever warns.

A [dormant](/help/reference/glossary#dormant) listing (nobody selling now) is skipped.

## When it runs

- **Before Keepa**, from Amazon's current offers, when the gate is set to **fail** and the FBA count is already outside the range: the row stops without spending a Keepa token.
- **After Keepa history** for the seller count otherwise.
- **After the Buy Box data** (stage 2, 3 tokens) for the top-seller share, and after the seller-profile lookup (1 token per seller) for the distributor flag. Both happen in the account stage, only for rows still passing.

## Settings

Settings, **Gates** tab, card **7 Competition shape** (Needs: Keepa / SP-API).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **warn** | **off**, **warn** or **fail**. |
| **Min FBA sellers** | 3 | Lower it to accept listings with fewer proven sellers. |
| **Max FBA sellers** | 12 | Raise it to accept crowded listings. |
| **Max top-seller Buy Box share (%)** | 70 | Lower it to be stricter about one seller dominating. |

The distributor flag is set on the **Profiles** tab, **Seller profiles** section:

| Field | Default | What it does |
|---|---|---|
| **Look up seller profiles** | on | Off skips the lookup and the distributor flag. |
| **Sellers per row** | 3 | How many top Buy Box sellers to look up. |
| **Distributor when brand is at least (% of storefront)** | 50 | A seller at or over this share of the brand is flagged. |

## Mode in each profile

| Profile | Mode | Min | Max | Max top share |
|---|---|---|---|---|
| Strict | warn | 3 | 12 | 70% |
| Test order (default) | warn | 3 | 12 | 70% |
| Dry goods only | warn | 3 | 12 | 70% |

Because every shipped profile has this gate on **warn**, it never rules a row out before Keepa unless you set it to **fail**.

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| warn / fail | 2 sellers, under 3 | Fewer FBA sellers than your minimum. |
| warn / fail | 15 sellers, over 12 | More than your maximum. |
| warn / fail | one seller held the Buy Box 82% of the year | One seller dominates. |
| warn | likely brand distributor: Acme Beauty Ltd (64% of 1,250 storefront listings are Nuxe, 71% of the Buy Box) | A top seller looks like the brand's distributor. Tagged BRAND_DISTRIBUTOR. |
| pass | 5 sellers, top Buy Box share 38% | |
| pass | 5 sellers | Before the Buy Box data is in. |
| skipped | dormant: no sellers now, none for 60 days | Nobody sells it now. |
| skipped | No offer count | No seller count from either source. |
| off | Gate off in this profile | |

Several reasons are joined with "; ". Seller count, top share and a distributor also feed the Competition and Risk groups of the [score](/help/concepts/score).

## What to do about a fail or warning

- A seller holding most of the Buy Box, or a brand distributor, often means the brand controls the listing. Check who they are on the [Sellers](/help/pages/sellers) page before buying.
- Too many sellers shows up as a low [your share](/help/reference/glossary#your-share) in [Demand](/help/gates/demand) too.
- To change the range, [change a threshold](/help/howto/change-a-threshold); to accept this product, [waive the gate](/help/howto/waive-a-gate).
