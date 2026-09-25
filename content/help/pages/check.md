---
title: Check ASINs
summary: Paste ASINs, EANs or Amazon links, with an optional landed cost, and screen them without a price list.
synonyms: [asin lookup, quick check, single product, verdict card, fetch anyway, re-check, one-off]
route: /check
order: 4
---
Check ASINs screens a handful of products without a file: paste them, press **Check**, and they go through the same gates, fees, Keepa and gating checks as an upload. Each check is a run, so it lands in [Runs](/help/pages/runs) too. The [Chrome extension](/help/pages/extension) gives the same verdict while you're on Amazon.

## The form

### ASINs, EANs or links, with an optional landed cost

One item per line:

```
B003AVM7XE
B0C62XSQS9, 4.73
https://www.amazon.co.uk/dp/B0F2HKZMPT  12.50
3337875597197  £6.20
```

- An **ASIN** (B0 and 8 more letters or digits, or a 10-character book ASIN), an **EAN** (8 to 14 digits), or an **Amazon link** (/dp/, /gp/product/ and similar; the ASIN is read from it).
- After it, optionally, a **landed cost**: what one unit costs you delivered to Amazon, all in. Separate it with a comma, space, tab, semicolon or bar. "£4.73", "4,73" and "4.73 GBP" all work. Pasting two columns from a spreadsheet works too.
- Blank lines and lines starting with # are ignored.
- Up to 500 items. For more, [upload a file](/help/pages/upload).

Under the box a live count shows what will be read, for example "3 to check: 2 ASINs, 1 EAN; 2 with a cost.", followed by any problems in amber: "line 3: "hello" isn't an ASIN, EAN or Amazon link", "line 2: no ASIN in that link", "line 4: "abc" isn't a cost", "line 5: B0C62XSQS9 is already listed".

Press Ctrl+Enter (Cmd+Enter on a Mac) in the box to check.

### Supplier

The supplier to file the offers under. Leave it blank for "Manual". If you name a supplier you already have, its VAT basis and currency are kept as they are.

### Profile

The profile to screen with; your default profile is picked for you. See [Profiles](/help/concepts/profiles).

### Check

**Check N** starts the check and opens its run. With one item it's worked on straight away and usually finishes in a few seconds ("Checking… a few seconds"); with several it says "Starting…" and they carry on in the background. A check is someone waiting, so it goes first on Keepa ahead of other runs (see [Keepa tokens](/help/concepts/keepa-tokens)).

Lines that couldn't be used are skipped and listed in a message, for example "Skipped: line 2: B0XXXXXXXX isn't on Amazon UK".

## With a cost, and without

With a landed cost, the cost is turned back into an ex-VAT unit cost (taking off your profile's inbound and prep per unit, £0.30 and £0.15 by default, any duty, and 20% VAT on the goods unless your profile says you're VAT-registered) and screened like any upload row: profit, ROI, margin, the [hurdle price](/help/reference/glossary#hurdle-price), order quantity and months to sell. A cost too small to cover inbound and prep is refused, for example "line 2: £0.40 landed doesn't cover inbound and prep (£0.45)".

With no cost, you still get everything else: sales, your share, sellers, Amazon, gating and fees. The [Budget fit](/help/gates/budgetFit) and [Fee engine](/help/gates/fees) gates are skipped, and instead of profit you get the [max landed](/help/reference/glossary#max-landed) cost: the most it can cost you landed and still clear the profit floors. The fee gate's line reads, for example, "No cost given: clears the floors at £7.85 landed or less (sells at £19.99)".

## The verdict card

A check of a single item opens its run with a verdict card above the table:

| Part | Shows |
| --- | --- |
| Verdict | **PASS**, **WARN** or **FAIL**; **Screening** while it's working and **updating** while more data is arriving. |
| **Score** | The win score, coloured by band (see [Score](/help/concepts/score)). |
| **no Keepa history** | Sales, history and Amazon presence need Keepa, and there isn't any. |
| Title, ASIN, EAN, **Amazon** | The product, with a link to its Amazon page. |
| "Checked 2 h ago · **Re-check**" | When the verdict was reached (hover for the exact time). Re-check runs the same input again as a new check. |
| **Apply to sell** | Only when Amazon gives an application link. See [Apply for brand approval](/help/howto/apply-for-brand-approval). |
| **Profit at £X** / **Profit** | Profit per unit at your landed cost, with ROI and margin. "no cost given" without one. |
| **Hurdle** / **Max landed** | With a cost: the sell price that clears the floors. Without: the most it can cost landed. |
| **Sells at** | The price it's scored at, and where that price came from. |
| **Sales / mo** | Estimated sales a month, with the seller count. |
| **Your share** | Your [share](/help/reference/glossary#your-share) of sales a month. |
| **Months to sell** | How long the first order takes to sell at your share, with the first order quantity. "needs a cost" without one. |
| **Amazon** | "selling now" (in red), "not now" with when Amazon was last seen, or "never". |
| **Gating** | **Open**, **Approval needed**, **Blocked** or **Unknown**, with the total fees. See [Gating](/help/gates/gating). |

Then the why-line. Gating and fees are filled in even when the item failed an early gate, since they don't depend on the verdict.

### Fetch anyway

If the item failed a gate before Keepa was asked (such as [Price band](/help/gates/priceBand) or [Compliance](/help/gates/compliance)), Keepa isn't spent on it. The card fills in what Amazon gives free (Buy Box, offers, whether Amazon sells it now) and says:

> Stopped at **Price band** before Keepa: Buy Box, offers and Amazon are from Amazon's current offers (free); sales, your share and history weren't fetched.

Sales, your share and months to sell read "not fetched: failed at price band".

**Fetch anyway** screens it again, gathering every source (Amazon, Keepa, gating and fees) past the failing gate. It spends Keepa tokens. The gates still decide the verdict, so a fail stays a fail; you just see the full picture, for example to judge whether to [waive the gate](/help/howto/waive-a-gate).

A check of several items opens an ordinary run: read it like any other on [Runs](/help/pages/runs).

## Recent checks

Your last 20 checks (archived ones are left out), newest first. Each shows what was checked (click to open its run), when, the supplier, and "with cost" if a cost was given. On the right: **Screening** while it runs; for a single item its verdict and score (for example "PASS · 78"); for several, "2 pass · 0 warn · 1 fail".

**Re-run** checks the same input again with fresh data, as a new check. It also puts the input back in the box.
