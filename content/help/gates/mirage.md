---
title: Borrowed rank (mirage)
summary: Flags listings whose sales rank or reviews look borrowed from another listing rather than earned.
synonyms: [mirage, borrowed rank, variation, review merge, new listing, history]
gate: mirage
order: 5
---
The mirage gate catches listings whose sales rank or reviews may belong to something else: a variation child riding its parent's rank, a listing too new to judge, or reviews merged in from another listing overnight. A [mirage](/help/reference/glossary#mirage) makes demand look better than it is.

## What it checks

Any one of these trips the gate:

- **Short history**: Keepa's rank history is shorter than **Min rank history**.
- **Review jump**: the review count jumped by more than **Max one-day review jump** in a single day.
- **Young variation**: the listing is a variation child younger than its parent.

## When it runs

**After Keepa history** (1 token per product, or free if a snapshot within the **Keepa history max age** exists). Without history it's skipped.

## Settings

Settings, **Gates** tab, card **5 Borrowed rank (mirage)** (Needs: Keepa).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **warn** | **off**, **warn** or **fail**. |
| **Min rank history (days)** | 90 | Raise it to be warier of new listings; lower it to accept them sooner. |
| **Max one-day review jump (%)** | 50 | Lower it to catch smaller review merges. |

## Mode in each profile

| Profile | Mode | Min history | Max review jump |
|---|---|---|---|
| First order (default) | warn | 90 days | 50% |
| Strict | warn | 90 days | 50% |
| Test order | warn | 90 days | 50% |
| Dry goods only | warn | 90 days | 50% |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| warn / fail | Borrowed rank: rank history is 41 days old | Less history than your minimum. |
| warn / fail | Borrowed rank: reviews jumped 120% in a day | A review merge or import. |
| warn / fail | Borrowed rank: variation child younger than its parent | The rank may be the family's. |
| | Borrowed rank: rank history is 41 days old, reviews jumped 120% in a day | Several reasons are joined with commas. |
| pass | 412 days of history, no review jumps | |
| skipped | Needs Keepa history | No history yet. |
| off | Gate off in this profile | |

A trip is tagged MIRAGE. In warn mode it lowers the Risk group of the [score](/help/concepts/score) through the **Mirage flag** scale.

## What to do about a fail or warning

- Look at the listing's history on Keepa for the date the rank or reviews appeared. A variation family often shares one rank: judge the child you'd sell, not the family.
- If you're happy the history is real, [waive the gate](/help/howto/waive-a-gate) for that product.
- To change how strict it is, [change a threshold](/help/howto/change-a-threshold).
