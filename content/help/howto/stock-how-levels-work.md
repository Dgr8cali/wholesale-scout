---
title: "Stock: how levels work"
summary: How the Stock workspace counts what you hold (a ledger of movements per bucket, FBA from SP-API, Amazon sales from the orders sync), days of cover, low and out, and the reorder suggestions.
synonyms: [stock, inventory, stock levels, buckets, self-ship, fba, tiktok fbt, movements, ledger, days of cover, reorder point, low stock, receive, adjust, transfer, return]
workspace: stock
order: 1
---
**Stock** (the fourth workspace: switch at the top of the sidebar, or Alt+Shift+W) tracks what you hold of your own items, in three **buckets**:

| Bucket | Where it comes from |
|---|---|
| **Self-ship** (at home) | The movements you record |
| **TikTok FBT** | The movements you record |
| **Amazon FBA** | SP-API's fulfillable units, synced nightly with the orders (and on demand with **Fetch stock** on the Ads dashboard). Never entered by hand: Levels shows "from SP-API, synced …" |

## The ledger

Self-ship and TikTok levels are the **sum of their movements**. Every change is a dated movement with a sign:

- **Received**: goods in, at a unit cost. Marking a purchase **Received** in the [Tracker](/help/pages/tracker) asks which bucket, and adds the receipt.
- **Sale**: out, when you record a sale outside Amazon.
- **Return**: units of a sale back into a bucket.
- **Adjustment**: a signed correction with a reason (stock count, damage, loss, sample).
- **Transfer out / in**: between your own buckets (e.g. self-ship to TikTok FBT).

A bucket can't go below 0: a sale, transfer or negative adjustment larger than what's there is refused. **Movements** lists them all with filters and **Export CSV**.

**Amazon's sales** come from the orders sync, never typed: Stock records sales on other channels (eBay, TikTok Shop, Shopify, Etsy, your website, in person, wholesale). Recording one checks the bucket holds it, takes the units out, and keeps the **cost at that moment**: unit cost + packaging + the listing's fee % of the price, so later cost changes don't rewrite past profit.

## Days of cover, low and out

**Demand** is units a day over the last 30 days: Amazon's orders (by the item's ASIN) for FBA, and the sales recorded here for the other buckets. **Days of cover** = units ÷ units a day, per bucket and in all ("—" when nothing sells). **Out** at 0 in all buckets, **low** at or under the item's reorder level (else Settings → Stock's low-stock default, 10), **ok** above.

## Reorder

For each item:

- **Reorder point** = (lead time + buffer) × units a day. The lead time is the item's, else its supplier's delivery days, else 14; the buffer is Settings → Stock's (7 days).
- **Suggested quantity** = 30 days of demand (Settings → Stock's days-of-cover target).
- **Due** at or under the reorder point; **soon** within a week of it; **ok** otherwise; **no demand** when nothing sold.

**Create purchase** opens the Tracker's purchase form with the item, its supplier and the suggested quantity filled in. When it arrives, mark it **Received** and choose the bucket.

## With Ads and Private label

An item with an ASIN is the same product as its **Ads product** and a **private-label candidate**'s listing: setting a candidate's listing ASIN makes the stock item if there isn't one. **Ads' days of cover** (and the stock guard rule) count every bucket, not just FBA, and the demand includes Stock's other sales.
