---
title: Keepa tokens
summary: What each Keepa call costs, how a run spends tokens in two stages, when it reuses data, and how to read the balance.
synonyms: [tokens, balance, refill, keepa, token cost, go first, snapshot, stale]
order: 4
---
Keepa sells its data by the token. Your Keepa plan refills your balance by a set number every minute. The app spends tokens on the price, rank and offer history that most gates and the score need. It is careful with them: rows that can be ruled out for free are ruled out first, the likeliest winners go first, and recent data is reused rather than bought again.

Without a real `KEEPA_API_KEY`, Keepa is off: the history gates are skipped ("Needs Keepa history") and no tokens are spent. See [Add an environment variable](/help/howto/add-an-env-var).

## What costs what

| Call | Tokens | When |
|---|---|---|
| History (stage 1) | 1 per product | A matched row that got through the early gates and has no recent snapshot |
| History with Buy Box data (stage 2) | 3 per product (1 + 2 for the Buy Box data) | A row that passes every gate on its stage-1 history, before its verdict |
| EAN lookup | as Keepa charges it, history only | A row whose EAN the SP-API catalog couldn't match; Keepa is asked by EAN instead |
| Seller profiles | 1 per seller | For rows that pass every gate, the top Buy Box sellers (3 by default). Cached for 7 days |
| Seller storefront scan | 10 per seller (1 + 9 for the list) | [Sellers](/help/pages/sellers): scanning a storefront |
| Balance check | 0 | Keepa's token endpoint is free |

Every figure the app records is Keepa's own count from its response, so the totals match what Keepa charged.

## How a run spends tokens

A run moves each row through three stages: lookup, Keepa, then account (gating, Amazon's fee estimate, seller profiles).

1. **Free checks first.** The compliance and budget-fit gates run on the supplier's row, with no API call. Then the SP-API catalog match and Amazon's current offers (also free) settle what they can before Keepa. A missing listing fails match quality. A Buy Box that can only fail the price band fails it. Amazon selling now fails Amazon presence, and a seller count outside the range fails competition, but only when those gates are in fail mode. These rows say "Ruled out from current offers before any Keepa token."
2. **Stage 1: history (1 token).** Rows still standing join the Keepa queue. The queue is sorted by rate-card profit at the current Buy Box, best first, so scarce tokens go to the likeliest winners. Rows with no price go last. With the history in, the gates run again (all but gating and fees). A row that fails a fail-mode gate stops here.
3. **Stage 2: Buy Box data (3 tokens).** A row that passes every gate on its stage-1 history goes back to Keepa for the Buy Box seller history before its verdict. That gives the top seller's Buy Box share for [Competition shape](/help/gates/competition), and the top sellers for the seller lookup.
4. **Seller profiles (1 token each).** For rows that still pass every gate, if **Look up seller profiles** is on in the profile.

### Fetch anyway

On a [Check](/help/pages/check), a product that fails a gate before Keepa shows "Stopped at <gate> before Keepa: Buy Box, offers and Amazon are from Amazon's current offers (free); sales, your share and history weren't fetched." **Fetch anyway** carries on past the failing gate (anything but a missing listing) and fetches the history, which spends the tokens.

## Waiting for a refill

Before each Keepa batch (up to 100 rows), the app reads the balance. It takes rows in queue order while the balance covers them, at 1 token for stage 1 and 3 for stage 2. The rest wait. The run works out when there will be enough for the next 20 or so rows, from Keepa's refill time and rate, and carries on then.

If Keepa runs out partway through a batch, the rows it didn't return wait a minute and are tried again.

The run page shows this in its progress panel:

- "**N** waiting on Keepa tokens · resumes about 14:32"
- "**N** Keepa tokens so far"

A run that's waiting keeps its place and needs nothing from you. **Pause** stops it after the current batch, and "Nothing runs and no Keepa tokens are spent until you resume."

If seller profiles run out of tokens, the why-line says "Keepa out of tokens: some seller profiles not looked up. Re-screen after the refill."

## One run on Keepa at a time

Only one run spends Keepa tokens at a time, so two big runs don't split the balance and both crawl. The turn goes to the run most recently put first with **Go first**; otherwise it goes to the run started earliest. Only runs that aren't paused or archived and still have rows waiting for Keepa are in line. Other runs carry on with their Amazon work meanwhile.

On a run that's waiting its turn, the progress panel says "Keepa is in use by <run>; this run waits its turn (one run uses Keepa at a time)." with a **Go first** button. On the [Runs](/help/pages/runs) page the same action is **Go first on Keepa** in a run's menu. The run that has the turn says "This run is the one using Keepa now."

## Reusing data: snapshots

Every Keepa fetch is saved as a snapshot of that ASIN. Any run (or re-screen) that needs the same ASIN within the profile's **Keepa history max age** uses the snapshot and spends no tokens. The default is **7 days**. Set it in [Settings](/help/pages/settings) → **Profiles** → **Keepa history**. Set it to 0 to always fetch fresh.

- A snapshot with the Buy Box data covers both stages. A history-only snapshot covers stage 1 but not stage 2.
- Where there are two snapshots, one with the Buy Box data beats a newer history-only one.
- **Re-screen** works from the data already stored. It fetches only for rows that now need data they never had (see [Profiles](/help/concepts/profiles#re-screening-with-another-profile)).
- Seller profiles are reused for 7 days, whatever the profile says.

On the [Runs](/help/pages/runs) page, a run whose newest Keepa data is more than 7 days old gets a **stale** badge. **Refresh Keepa data** in its menu sends those rows back to Keepa, which spends tokens.

## Reading the balance

### Top bar

When Keepa is set up, the top bar shows **Keepa N tokens**: your live balance. It refreshes every minute and whenever you come back to the tab. Hover it for the refill rate and what a product costs, e.g. "Refills 20/min; a product costs 1 token for its history, 3 more for Buy Box data if it gets that far". A dash means Keepa didn't report a balance.

### Home page

- **Keepa tokens available**: the balance, with "refills N/min".
- **Keepa tokens spent today**: across all runs, with a rough "≈ N products at 3 tokens each" and bars for the last 7 days.

### Run header

Under a run's name: the profile, start time, product count and the run's total, split by what it was spent on, e.g. "1,204 Keepa tokens (history 812 · Buy Box 360 · EAN lookups 5 · sellers 27)". Only the parts above zero are listed.

## Spending fewer tokens

- Tighten the free gates (price band, compliance, budget fit) in the profile. Rows they drop never reach Keepa.
- Keep **Keepa history max age** at 7 days or more when you re-upload the same suppliers often.
- Turn off **Look up seller profiles**, or lower **Sellers per row**, if you don't need the distributor check.
- Use **Re-screen** rather than a new upload to try different settings on the same list.
