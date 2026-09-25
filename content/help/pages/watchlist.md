---
title: Watchlist
summary: Products you're waiting on, each with the condition that would make it a buy, re-checked every Sunday with an email digest.
synonyms: [watch, alert, flip condition, notify, weekly re-check, email digest, now passes]
route: /watchlist
order: 10
---
The Watchlist holds products that aren't a buy yet but might become one. Each has a condition, such as "Buy Box ≥ £24.50" or "Brand approved". Every Sunday the whole list is re-checked. Anything that now passes, or meets its condition, is listed under **Now passes** and emailed to you.

Every favourite is on the watchlist. A starred product with no condition is simply re-checked each week ("Re-check weekly"). See [Favourites](/help/pages/favourites).

## Putting a product on the watchlist

Open a row's details on a run (or on Favourites) and find the **Watchlist** section:

| Control | What it does |
|---|---|
| Condition selector | **Re-check weekly** (no condition), **Buy Box ≥ £X**, **Landed ≤ £X**, **Brand approved**, **Sellers ≤ N**, **Amazon gone 30+ days** or **Back in stock at supplier**. |
| Amount box | Appears for Buy Box, Landed and Sellers. It takes a £ amount or a seller count, and it must be more than 0. |
| **No supplier yet** | Tick it when you don't have a supplier for the product. Then any upload or Qogita pull that offers this EAN at or under its max landed cost alerts you straight away. It doesn't wait for Sunday. It's ticked for you on rows that have no cost. |
| **Watch** / **Save** | **Watch** puts it on the list (and stars it). **Save** changes the condition of a product that's already watched. |

The heading shows the condition that's suggested, for example "Watchlist · suggested: Buy Box ≥ £18.45". It's worked out from what blocked the row:

| What blocked it | Suggested condition |
|---|---|
| [Fees](/help/gates/fees) gate, with a cost | Buy Box ≥ the [hurdle price](/help/reference/glossary#hurdle-price), rounded up to 5p |
| Fees gate, no cost | Landed ≤ the [max landed](/help/reference/glossary#max-landed) cost, rounded down to 5p |
| [Price band](/help/gates/priceBand), under the floor | Buy Box ≥ the floor |
| [Gating](/help/gates/gating) | Brand approved |
| [Competition](/help/gates/competition), too many sellers | Sellers ≤ the limit |
| [Amazon presence](/help/gates/amazonPresence) | Amazon gone 30+ days |
| Supplier stock is 0 | Back in stock at supplier |
| A warn that needs brand approval | Brand approved |
| Anything else | Re-check weekly |

You can change the suggestion before you click **Watch**. The **Watch** button on the [Chrome extension](/help/pages/extension) panel uses the suggested condition.

## When a condition counts as met

| Condition | Met when |
|---|---|
| Buy Box ≥ £X | The current Buy Box is at or above £X. |
| Landed ≤ £X | The cheapest costed offer from any supplier, landed, is at or under £X. |
| Sellers ≤ N | The FBA seller count (or the offer count, if there's no FBA count) is at or under N. |
| Brand approved | You've marked the brand **Approved** on [Brands](/help/pages/brands), or the listing is now open to you. |
| Amazon gone 30+ days | Amazon isn't selling now and was last seen 30 or more days ago (or never, in the Keepa history). It needs Keepa history to judge this. |
| Back in stock at supplier | The total stock across its offers is more than 0. |

## The weekly re-check

Every Sunday at 06:00 (UTC) a run named "Watchlist re-check <date>" screens every favourite on its latest offer, using your default profile. It's screened as usual. Keepa is only asked again where the stored history is older than 7 days (the profile's max age), and gating is refreshed. See [Keepa tokens](/help/concepts/keepa-tokens). A new weekly run isn't started within 6 days of the last one.

When the run finishes, each item's check is recorded and an alert is raised if:

- it now **passes** and didn't last time ("Now passes (was warn) · Buy Box £21.40"), or
- its condition is **met** and wasn't last time ("Buy Box ≥ £20.00: Buy Box £21.40").

An item that stays passing, or stays met, doesn't alert again.

**Re-check now** runs the same check straight away, even if one ran this week, and takes you to the run. With nothing to check you'll see "Nothing to re-check: nothing on the watchlist".

## Now passes

These are the alerts you haven't dismissed, newest first. Each has a badge:

- **Now passes**: the product passes now.
- **Condition met**: its condition is met.
- **Supplier found**: a new upload or Qogita pull offers a "No supplier yet" product at or under its max landed cost, for example "Acme Ltd offers it at £6.20 landed (max £7.10)". The same offer won't alert twice in a week.

Each line links to the ASIN on Amazon and to the run (**open run**), shows when the alert was raised, and says "emailed" if it went out by email. The **×** dismisses one alert. **Dismiss all** clears them all.

## Watching

This is one row per watched product:

| Column | What it shows |
|---|---|
| **Product** | Title, EAN, ASIN (links to Amazon) and your note. |
| **Waiting for** | The condition, or "Re-check weekly", plus a **no supplier** badge if that box is ticked. |
| **Last check** | The verdict at the last re-check, what was seen ("met · Buy Box £21.40", "still needs approval", "Amazon last seen 12 days ago"), and when. It says "Not re-checked yet" before the first check. |
| **Buy Box**, **Max landed** | From the last check. |
| **Latest result** | The verdict and run of the latest result, linking to the run. It says "never screened" if there isn't one. |

## Email digest

One email per re-check lists every new alert, with links to Amazon, the run and the watchlist. "Supplier found" alerts are emailed as soon as they happen. Email is sent through Resend and needs `RESEND_API_KEY` and `ALERT_EMAIL_TO` (several addresses can be separated by commas). `ALERT_EMAIL_FROM` is optional. Without them the page shows "Email alerts are off: set RESEND_API_KEY and ALERT_EMAIL_TO in Vercel. Alerts still show here." See [Add an environment variable](/help/howto/add-an-env-var).
