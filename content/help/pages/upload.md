---
title: Upload
summary: Screen supplier price lists: drop xlsx or csv files, map their columns, check the rows and start a run.
synonyms: [price list, supplier sheet, import, csv, xlsx, column mapping, ingest, spreadsheet]
route: /upload
order: 3
---
Upload turns one or more supplier price lists into a run. You go through four steps: **Drop**, **Map**, **Review** and **Screen**. A layout you've mapped before is recognised, so a supplier's next file needs no setup.

The step buttons at the top take you back to any step you've finished, and forward to one you're allowed to reach (Map needs a file; Review needs every file mapped; Screen needs rows to screen).

## 1. Drop

Drop files on the box, or click it to choose them. You can add several at once.

- Types: .xlsx, .xls, .csv (also .tsv and .txt).
- Up to 10 MB per file, and 5,000 rows per upload across all files. A larger file is refused with a message such as "prices.xlsx is 12.4 MB; the limit is 10 MB per file. Filter the export or split it."
- The first sheet is read; you can pick another on the Map step.

Each file is listed with its row count and either **Layout remembered: [supplier]** (its headers match a layout you've mapped before, and that supplier's VAT basis and currency are filled in) or **New layout**. The bin removes a file.

**Map columns** goes to the next step. When every file's layout is remembered, you'll see "Every layout is remembered: you can go straight to Review." and a **Review** button that skips mapping.

## 2. Map

With several files, a tab per file; a dot marks a file that still needs something, a tick one that's ready.

### Supplier

| Field | What it's for |
| --- | --- |
| **Name** | The supplier. Start typing to pick a saved supplier ("· saved supplier" shows when it matches one), which fills in its VAT basis and currency. A new name creates a supplier. Defaults to the file name. |
| **Prices are** | **Ex-VAT** or **Inc-VAT**. Inc-VAT prices have VAT taken off using the rate below. |
| **VAT on these goods (%)** | The VAT rate on the goods, 20 by default. Used to strip VAT from inc-VAT prices. |
| **Currency** | The price list's currency: GBP, EUR, USD, PLN, CHF, SEK, DKK, CZK, HUF, CNY, HKD, JPY, CAD, AUD, TRY or AED. |
| **GBP per 1 EUR** (or your currency) | Only for a currency other than GBP. Filled in from the ECB reference rate, with its date; you can type your own. If no rate could be fetched it says "Couldn't fetch a rate; enter it by hand". |
| Sheet picker | Only for a workbook with several sheets. Switching sheet re-reads the layout. |

If the price column's header names a currency ("Price (€)", "Unit cost USD"), that currency and its rate are picked for you, and you'll see "Currency from the "Price (€)" column header".

The VAT basis and currency are saved with the supplier and used for every future file from them. Costs are stored in GBP ex-VAT.

### Columns

**Header row** is the row your column names are on. It's found for you (the row in the first 20 that looks most like headers); change it if the file has a logo or title rows above the headers.

Each Wholesale Scout field on the left gets a column from your file on the right, guessed from the header names. Under each choice you'll see a few sample values ("e.g. 5012345678900 · …") so you can check it. Choose **— not in this file —** for a field the file doesn't have.

| Field | Needed | Notes |
| --- | --- | --- |
| **EAN / GTIN** | yes | 8 to 14 digits. UPC-12 is padded to 13; a GTIN-14 with a leading zero is trimmed. |
| **Unit price** | yes | Your cost. "£1,234.50", "1.234,50 €" and "12,5" are all read. |
| **Unit / pack size** | no | Pieces per pack. When mapped, you're asked **Price is per…** **piece** or **pack**; a pack price is divided by the pack size. |
| **MOQ per line** | no | Minimum order for the line. Used for order quantity and the [Budget fit](/help/gates/budgetFit) gate. |
| **Stock** | no | How many the supplier holds. |
| **Product name** | no | Helps [Match quality](/help/gates/matchQuality) and spotting [multipacks](/help/reference/glossary#multipack). |
| **Brand** | no | |
| **Category** | no | |

What's still missing is listed under the table and next to **Review rows**, for example "map the EAN column", "map the unit price column", "name the supplier", "enter an FX rate" or "say whether price is per piece or per pack". **Review rows** is enabled once each file is ready. When you screen, the mapping is saved for this supplier and header layout.

## 3. Review

For each file: the supplier, VAT basis and currency, and:

- **N rows ready**.
- **N set aside for manual matching**: rows with "No usable EAN" (missing, not digits, or an Excel number in scientific notation that's already lost digits) or "No price". Open **Rows set aside** to see each one by row number. These rows aren't screened.
- **N with a bad check digit**: EANs whose check digit is wrong, shown in amber. They're still screened, but may not match.

A preview of the first 8 rows shows row number, EAN, name, the cost quoted per unit, the cost in GBP ex-VAT per unit, pack and MOQ. Check the GBP column: if it's out by a factor, the currency, VAT basis or piece/pack choice is wrong. **Back** returns to Map to fix it.

**Continue** is enabled when there are rows and no more than 5,000 in total.

## 4. Screen

Shows how many rows from how many files. The same EAN in several files becomes one product, and the cheapest offer is the one scored.

**Profile** chooses the thresholds to screen with; the default profile is picked for you (First order unless you've changed it). See [Profiles](/help/concepts/profiles).

**Screen N rows** creates the run and opens it on [Runs](/help/pages/runs). Screening runs in the background: you can leave the page.

When a new file offers a product on your [Watchlist](/help/pages/watchlist) marked "No supplier yet", at or under its max landed cost, that's flagged as soon as it's uploaded.

## Tips

- For a handful of items without a file, use [Check ASINs](/help/pages/check).
- A supplier's terms and past files are on [Suppliers](/help/pages/suppliers).
- For Qogita, use [Qogita](/help/pages/qogita) rather than exporting and uploading.
