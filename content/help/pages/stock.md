---
title: Stock
summary: The Stock workspace tracks what you hold, item by item, in three buckets (self-ship, Amazon FBA, TikTok FBT), with sales, movements, reorder suggestions and imports from StockPilot.
synonyms: [stock, inventory, orders, purchases, on order, edit order, delete, edit, undo, mistake, correct, archive, restore, audit log, negative, record a new order, order id, order link, tracking, expected date, new supplier, alibaba, 1688, levels, stock levels, movements, ledger, reorder, reorder point, days of cover, self-ship, fba stock, tiktok fbt, stockpilot, goods in, transfers]
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
| **Levels** | Every item: units per bucket and in all, value at cost, days of cover (per bucket and in all, at the last 30 days' sales), and a status: **ok**, **low** (at or under its low-stock level) or **out**. Click an item for its drawer: details (editable, with **+ New supplier**), its orders (with **Receive** on the open ones), listings, its level over the last 30 days, its movements, and **Record sale**, **Receive**, **Adjust**, **Transfer** and **Return**. **New item** adds one; **Record a new order** records an order (below). Tick items to **Archive selected**; **Show archived** lists archived items to Restore or delete permanently |
| **Movements** | The ledger: every receipt, sale, return, adjustment and transfer, filtered by item, bucket, kind and dates, with each receipt's order (a link when its page is known) and supplier, and **Export CSV**. Each row can be edited or deleted; **Audit log** lists every edit and delete |
| **Sales** | Sales outside Amazon (eBay, TikTok Shop, your website, in person), each with its cost and profit at the moment it was recorded, filtered by channel |
| **Orders** | Every purchase of a stock item, however it was recorded (here, the Tracker, a product page): image, item, supplier, status, quantity, unit cost (and the price in its currency), total, order number (a link when its page is known) with tracking, ordered and expected dates. **Open** shows what's on order (with its landed total), **All** everything. Each row has **Receive** (open orders), **Edit** and **Delete** (open orders only). **Record a new order** adds one |
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

An order is one record wherever it shows: Stock → Orders, the item's drawer, the Tracker and the product page. **Edit** (on any of them) changes the item, supplier, quantity, unit cost (£ landed, or the price in another currency at its rate, which sets the £), order number and link, dates, tracking and notes. Once it's been received, its receipt in Stock follows the edit (quantity, unit cost, item, supplier, order details). **Delete** is there while it's still Ordered; one that's been received needs its receipt deleted first (Movements), which sets it back to Ordered.

### Every purchase belongs to a stock item

A purchase recorded on a product page (**Your purchases → Record a purchase**) finds the stock item with that ASIN, or makes one, before it's saved: the title, image, brand, package size and weight and the catalogue product come from the catalogue, and the purchase's supplier and cost fill the item's if they're empty (an archived item with that ASIN is restored). So it's the same record as one recorded here, and shows on Stock → Orders. An item's picture comes from the catalogue product or the Ads product, then Amazon's catalogue through SP-API (all free), and only then Keepa (1 token); an item nothing has a picture of isn't looked up again.

## A new supplier from Stock

**+ New supplier** sits beside the supplier choice on the new item form, the item drawer, Receive and the order form. Give the **Name**, the **Type** (manufacturer, wholesaler, marketplace seller, or retailer), the **Marketplace** for a marketplace seller (Alibaba, 1688, eBay, Amazon…), **Website**, **Contact**, **Lead time (days)** and **Notes**. It's created and selected at once. A name that's already a supplier (in any case) selects that one instead of making a second. It appears on [Suppliers](/help/pages/suppliers) with no price lists: **Stock only** there lists these.

## Correcting mistakes

Every level is the sum of its movements, so a mistake is corrected by editing or deleting the movement: the levels follow, and nothing else needs adjusting. Every edit and delete is kept in **Stock → Movements → Audit log** (the last 500: what changed, when, and the record before and after; **before / after** shows them).

**Edit a movement** (the pencil on its row on Movements): quantity, date, bucket (Self-ship or TikTok FBT; Amazon FBA follows SP-API), reason, note and unit cost. The quantity keeps its kind's direction whatever sign you type (a sale of 3 takes 3 off); an adjustment keeps the sign you give it. Editing a sale changes its sale's quantity and date too; editing one half of a transfer changes the other half's quantity and date.

**Delete a movement** (the bin on its row, after a confirm). What goes with it:

| Deleting | Also |
|---|---|
| A sale | Its sale on Stock → Sales, and any returns of it |
| A transfer (either half) | The other half: the units are back where they came from |
| A receipt from an order | Nothing else is deleted, but the order goes back to **Ordered** in the Tracker (the confirm and the message say so); Receive it again when it's right |
| A return | Its sale can take that return again |

Tick several rows and **Delete selected** to delete them together (each with what goes with it).

**Delete a sale** on Stock → Sales: its movement (and returns) go too. **Delete an order** in an item's drawer (the bin beside Receive) while it hasn't been received; one that's been received needs its receipt deleted first. **Delete a listing** in the drawer: sales already recorded keep their cost.

**Delete an item** (Delete item in its drawer, or the bin on its Levels row) archives it: the confirm shows how many movements, sales, listings and orders it has, and all of them are kept. Archived items are hidden from Levels, Reorder and Home. **Show archived** on Levels lists them with **Restore**, and **Delete permanently**, which removes the item with its movements, sales, listings and orders (in the Tracker too). Only an archived item can be deleted permanently. Tick several items for **Archive selected**, or, among archived ones, **Restore selected** and **Delete permanently**.

**Negative.** Deleting or editing can leave a bucket below 0 (a receipt deleted under a sale, say). That's allowed, so you can correct things in any order, but the movement after which the bucket went below 0 shows a red **negative** chip on Movements, and the bucket's figure on Levels shows one too, until it's put right: receive the missing stock, adjust, or edit the movement.

