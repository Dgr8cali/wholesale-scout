---
title: "Stock: importing from StockPilot"
summary: Bring your StockPilot data into Stock: the raw stockpilot_workspaces table export or an items CSV, previewed first, matched to your Amazon listings by ASIN, and safe to import again.
synonyms: [stockpilot, import, migrate, stockpilot_workspaces, json export, csv import, opening balance, stock import]
workspace: stock
order: 2
---
**Stock → Import** brings data in from StockPilot (the earlier stock app) or any items CSV. Nothing is written until you click **Import** after the preview.

## StockPilot: the raw table export

Export the `stockpilot_workspaces` table from StockPilot's Supabase project as JSON (Table editor → the row → export, or `select * from stockpilot_workspaces`): one row per account, with its products, sales, restocks, adjustments, transfers and returns. Drop the .json file on **Import**.

The preview shows each item: its SKU (an item without one gets `SP-` and the start of its StockPilot id), its **ASIN**, its supplier (matched to your suppliers by name, or added), whether it's new or an update, and its self-ship and TikTok levels after the import.

- **ASINs.** StockPilot kept none. An item whose name shares two or more words with an Ads product's title gets that ASIN suggested ("suggested from Ads product: …"): leave it filled to link them, clear it if wrong, or type one. Linked, the item's FBA level and Amazon sales join it.
- **Levels.** StockPilot's quantities are its levels when exported, after everything it recorded. Its movements (restocks, sales out of self-ship or TikTok, adjustments, transfers, returns) are imported, and an **opening balance** receipt per bucket makes up the difference, dated before them, so each bucket ends exactly on StockPilot's number.
- **Left out**, and said so: FBA quantities (Amazon FBA comes from SP-API), sales out of FBA (Amazon's orders come from the orders sync), photos stored in StockPilot as data (images come from Keepa or the listing), and the audit log.

**Importing again is safe**: every item, listing, sale and movement keeps StockPilot's own id, so a second import updates what's there and adds nothing twice. The preview says how many movements are new and how many are already in.

## An items CSV

A CSV with one item per row and StockPilot's column names (or plain ones): `sku`, `name`/`product_name`, `asin`, `barcode`, `category`, `unit_cost`/`cost_price`, `packaging_cost`, `reorder_level`/`low_stock_threshold`, `lead_time_days`, `supplier`/`supplier_name`, `supplier_website`, `stock_quantity`/`quantity_home` and `quantity_tiktok_fbt` (opening balances dated today), `photo_url`. A 0 is read as 0. Columns it doesn't know are listed in the preview and ignored. Items are matched by SKU, so a re-import updates them.
