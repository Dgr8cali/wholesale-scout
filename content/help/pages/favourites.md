---
title: Favourites
summary: The products you've starred, each with its latest result from any run, your notes, and one-click re-screening.
synonyms: [star, starred, shortlist, saved products, bookmarks, notes]
route: /favourites
order: 9
---
Favourites collects every product you've starred in one table. Each row shows the product's latest result from any run, with your note. From here you can re-screen them, export them, and put them on the [Watchlist](/help/pages/watchlist).

## Adding and removing favourites

- **Star** a row on any run's results, or select rows and use **Star** in the bulk bar. See [Runs](/help/pages/runs).
- Typing a **Favourite note** in a result's details stars the product as well.
- The **☆ Star** button on the [Chrome extension](/help/pages/extension) panel stars the product you're looking at on Amazon.
- Choosing **Watch** in a result's details also stars it, because every item on the watchlist is a favourite.

A favourite is saved against the product's EAN and ASIN, not against a run, so it stays starred in every run.

To remove one, click its filled star on this page. If it has a note you'll be asked first ("Un-star this product?"), because the note is deleted with it. To remove several, select them and use **Unstar** in the bulk bar.

## The header

The line under the title counts your favourites and how many are **outdated**, meaning their latest result is over 7 days old.

| Control | What it does |
|---|---|
| Profile selector | Picks the [profile](/help/concepts/profiles) that **Re-screen favourites** uses. **Default profile** uses whichever profile is your default. |
| **Re-screen favourites** | Starts a new run with only your favourites, named "Favourites <date>" (for example "Favourites 25 Sept 2026"), and takes you to it. Each product is screened on its latest offer, or on its most recent offer if it was never screened to the end. Favourites with no offer at all are skipped. If none have an offer, you'll see "No favourites with an offer to screen". Keepa is only asked again where the stored history is older than the profile allows. |
| **Export N to xlsx** | Downloads the rows the filters are showing as a spreadsheet. Rows that have never been screened are left out. |

## The table

This is the same results table as on a run. Its columns, resizing, sorting, row density, sparklines and details are explained in [Runs](/help/pages/runs). What's different here:

- Every row is the product's **latest** result from **any** run, not from one run. Under the title you'll see "Screened <when> · <run name>" (the run name links to the run), an **outdated** badge if it's over 7 days old, and your note in italics.
- A favourite that has never been screened to the end shows as pending, with "Not screened yet: re-screen it."
- There's no grouping of the same product from several suppliers. It's one row per favourite.

### Filters

The filter bar works as on a run: verdict, band, **Failed gate**, **Brand**, supplier, **Amazon on listing**, approval status, **Waived**, **Ranges**, search, and **Saved filters**. **Favourites only** isn't offered, since everything here is a favourite. Your filters on this page are remembered in this browser.

### Details

Click a row to open its details in a side drawer. Use Up and Down (or K and J) to step through rows, and Escape to close it. Click the arrow at the start of a row to expand its details in place. The details are the same as on a run. The parts you'll use most here:

- **Favourite note**: saves a moment after you stop typing, and when you click away. It can be up to 500 characters.
- **Watchlist**: set a flip condition and choose **Watch**, or **Save** to change it. See [Watchlist](/help/pages/watchlist).
- **Waive**: waives a gate for this product. It applies when the product is next screened ("… waived: it applies when the product is next screened"). See [Waive a gate](/help/howto/waive-a-gate).

### The bulk bar

Tick rows (or the header checkbox to select every row shown) and a bar appears:

| Control | What it does |
|---|---|
| **Unstar** | Removes the selected favourites. If any have notes, you're asked first. |
| Gate selector, **Reason for all (optional)**, **Waive**, **Un-waive** | Waives or un-waives the chosen gate for every selected product. See [Waive a gate](/help/howto/waive-a-gate). |
| **Re-screen selected** | Like **Re-screen favourites**, but only for the selected rows. |
| **Export selected** | Downloads just the selected rows as xlsx. |
| **Clear selection** | Unticks everything. |

The order columns (first order, months to sell) use your default profile's line cap and months limit, the same as on a run.
