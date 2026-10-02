---
title: Stock
summary: The Stock workspace tracks what you hold, item by item, in three buckets (self-ship, Amazon FBA, TikTok FBT), with sales, movements, reorder suggestions and imports from StockPilot.
synonyms: [stock, inventory, levels, stock levels, movements, ledger, reorder, reorder point, days of cover, self-ship, fba stock, tiktok fbt, stockpilot, goods in, transfers]
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
| **Levels** | Every item: units per bucket and in all, value at cost, days of cover (per bucket and in all, at the last 30 days' sales), and a status: **ok**, **low** (at or under its low-stock level) or **out**. Click an item for its drawer: details (editable), listings, its level over the last 30 days, its movements, and **Record sale**, **Receive**, **Adjust**, **Transfer** and **Return**. **New item** adds one |
| **Movements** | The ledger: every receipt, sale, return, adjustment and transfer, filtered by item, bucket, kind and dates, and **Export CSV** |
| **Sales** | Sales outside Amazon (eBay, TikTok Shop, your website, in person), each with its cost and profit at the moment it was recorded, filtered by channel |
| **Reorder** | When each item needs ordering again and how many: the reorder point, the suggested quantity, and **due** / **soon** / **ok**. **Create purchase** opens the Tracker's purchase form ready filled |
| **Import** | From StockPilot (its raw table export) or a CSV of items, previewed before anything is written: [Stock: importing from StockPilot](/help/howto/stock-importing-from-stockpilot) |

**Settings → Stock** holds the low-stock default (10 units), the days of cover a reorder buys (30) and the reorder lead-time buffer (7 days). Home has a Stock row: value at cost, units by bucket, items low or out, and reorders due.
