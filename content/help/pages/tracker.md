---
title: Tracker
summary: What you've bought, the app's prediction frozen at that moment, and what actually happened, so you can see how far to trust the app.
synonyms: [purchases, orders, bought, inventory, predicted vs actual, results, outcomes, accuracy, p&l]
route: /tracker
order: 12
---
The tracker keeps every purchase with the app's prediction as it stood when you bought, and compares it with what actually happened once the stock is live. Over time it tells you how accurate the app is for you, and where it's optimistic.

## Recording a purchase

Two ways:

- **On a product's page**, under **Your purchases**: **Record a purchase**, then the units, the landed cost per unit (filled in from the cheapest supplier; change it to what you actually paid landed), the supplier, the order date and an optional note. **Save**.
- **On [Plan](/help/pages/plan)**, after placing a supplier's order: **Record as bought** on that supplier's group records every line with its quantity and landed cost, dated today.

The prediction is frozen then, from the product's latest screening: sell price, Amazon's fees per unit, profit per unit at your landed cost (with ROI and margin), total sales and [your share](/help/reference/glossary#your-share) a month, the FBA sellers, [months to sell](/help/reference/glossary#months-to-sell) your units, profit a month, the score, verdict, the [product page's](/help/pages/products) Buy/Wait/Skip and confidence, the profile, and which run it came from. Later screenings don't change it.

## Moving it along

Each purchase has a status: **Ordered** → **Received** → **Sent to Amazon** → **Live** → **Closed** (sold out or written off). Change it on the product's page; the date each status was reached is kept.

## The Tracker page

- **Money in stock**: units × landed for everything not closed.
- **Predicted profit / month**: next month's profit on open purchases, from the frozen profit per unit at your share, never counting more units than you bought.
- **Profit to date**: from Amazon's reports.
- **Pipeline**: how many purchases are at each status.

The table lists each purchase (open ones, or all with **All, with closed**): the product (linked to its page), supplier and order date, status, units, landed cost, profit per unit and sales a month predicted beside actual (with how far off, green when better than predicted, red when worse), units sold and profit to date.

**Delete** (on the product's page) removes a purchase and its frozen prediction.

## Where the actual figures come from

Every night after 2am (and when you click **Sync now** at the top of the Tracker), the app reads your own Amazon data through SP-API:

| What | From | Used for |
|---|---|---|
| Units sold and the prices customers paid, per product per day | Amazon's orders report (the last 30 days each night; 90 days the first time) | Sales a month, sell price, revenue |
| FBA stock (fulfillable, reserved, inbound) | The FBA inventory API | At Amazon, on the way |
| Amazon's fee estimate at the price you actually sold at | The fees API | Fees and profit per unit |

Only FBA sales count (merchant-fulfilled orders aren't from this stock), and cancelled orders are left out. Sales go to your purchases of a product first in, first out: the earliest purchase sells first, from the day it went **Live** (or was sent, or ordered).

The actual fees go through the same fee engine as the prediction (digital services fee, VAT on fees if you're not VAT-registered, storage and returns allowances), so the two are compared like for like. Profit per unit is the average price less those fees, output VAT if you're VAT-registered, and your landed cost.

**Sales / mo** is measured over the days since it went live (from the first week on), or up to the last sale if it sold out. **Sell-out** is the units left at that pace.

The SP-API app doesn't currently have two permissions, so these aren't shown: your **Buy Box share** (needs the Brand Analytics role) and the **exact fees charged on each order** (needs the Finance and Accounting role; Amazon's fee estimate at your selling price stands in). Add those roles to the app in Seller Central's Developer Central and re-authorise it to get them.

The line at the top of the Tracker says when the figures were last read; hover it for any error from the last sync.
