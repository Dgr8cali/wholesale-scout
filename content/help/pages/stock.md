---
title: Stock
summary: The Stock workspace tracks what you hold, item by item, in three buckets (self-ship, Amazon FBA, TikTok FBT), with sales, movements, reorder suggestions and imports from StockPilot.
synonyms: [stock, inventory, record a new order, order id, order link, tracking, expected date, new supplier, alibaba, 1688, levels, stock levels, movements, ledger, reorder, reorder point, days of cover, self-ship, fba stock, tiktok fbt, stockpilot, goods in, transfers]
route: /stock
order: 25
workspace: stock
---
**Stock** is the fourth workspace, next to Wholesale, Private label and Ads (switch at the top of the sidebar, or Alt+Shift+W). It tracks what you hold for each item, in three buckets:

| Bucket | Where its figure comes from |
|---|---|
| **Self-ship** (stock at home) | The sum of its movements: receipts, sales, returns, adjustments, transfers |
| **Amazon FBA** | SP-API's fulfillable count for the item's ASIN (or SKU), synced nightly with the orders and by **Fetch stock** on the Ads dashboard. Never typed in |
| **TikTok FBT** | The sum of its movements, like self-ship |

Amazon's own sales come from the orders sync, so they're never typed in either. How it all adds up: [Stock: how levels work](/help/howto/stock-how-levels-work).

## The pages

| Page | What it does |
|---|---|
| **Levels** | Every item: units per bucket and in all, value at cost, days of cover (per bucket and in all, at the last 30 days' sales), and a status: **ok**, **low** (at or under its low-stock level) or **out**. Click an item for its drawer: details (editable, with **+ New supplier**), its orders (with **Receive** on the open ones), listings, its level over the last 30 days, its movements, and **Record sale**, **Receive**, **Adjust**, **Transfer** and **Return**. **New item** adds one; **Record a new order** records an order (below) |
| **Movements** | The ledger: every receipt, sale, return, adjustment and transfer, filtered by item, bucket, kind and dates, with each receipt's order (a link when its page is known) and supplier, and **Export CSV** |
| **Sales** | Sales outside Amazon (eBay, TikTok Shop, your website, in person), each with its cost and profit at the moment it was recorded, filtered by channel |
| **Reorder** | When each item needs ordering again and how many: the reorder point, the suggested quantity, and **due** / **soon** / **ok**. **Create purchase** opens the order form ready filled |
| **Import** | From StockPilot (its raw table export) or a CSV of items, previewed before anything is written: [Stock: importing from StockPilot](/help/howto/stock-importing-from-stockpilot) |

**Settings → Stock** holds the low-stock default (10 units), the days of cover a reorder buys (30) and the reorder lead-time buffer (7 days). Home has a Stock row: value at cost, units by bucket, items low or out, and reorders due.

## Orders: from ordered to received

**Record a new order** (on Levels, and on the [Tracker](/help/pages/tracker) as **Record a stock order**) records what you've ordered before it arrives:

1. **Item**: pick one, or **+ New item** (SKU, name, optional ASIN), added when you save.
2. **Supplier**: pick one, or **+ New supplier** (below).
3. **Quantity** and the **cost per unit**: landed, in £; or, with another **Currency** (USD, EUR, CNY), the unit price in that currency and **£ per 1** of it (USD at 0.79 means $1 = £0.79). The £ figure is worked out and shown.
4. **Order id** (the supplier's order or reference number) and **Order link** (the order's page on their site, such as an Alibaba, 1688 or eBay order), **Ordered on**, **Expected**, and the **Carrier** and **Tracking number** if you have them. Notes are optional.

It goes in the Tracker as **Ordered**, and shows under **Orders** in the item's drawer with its order number (a link when the page is known), expected date and tracking. When it arrives, click **Receive** there (or set it to Received on the Tracker) and choose the bucket: its units go in as a receipt at the landed cost, carrying the order number and link, the supplier, the order date, the tracking and the currency. Receiving it twice doesn't add it twice.

**Receive** on an item without an order in the Tracker (a delivery you didn't record, an opening count) takes the supplier and, under **The order**, the same order fields; a unit cost in another currency is turned into £ at the rate.

An order's details can be filled in or changed later: **Order** on its Tracker row.

## A new supplier from Stock

**+ New supplier** sits beside the supplier choice on the new item form, the item drawer, Receive and the order form. Give the **Name**, the **Type** (manufacturer, wholesaler, marketplace seller, or retailer), the **Marketplace** for a marketplace seller (Alibaba, 1688, eBay, Amazon…), **Website**, **Contact**, **Lead time (days)** and **Notes**. It's created and selected at once. A name that's already a supplier (in any case) selects that one instead of making a second. It appears on [Suppliers](/help/pages/suppliers) with no price lists: **Stock only** there lists these.
