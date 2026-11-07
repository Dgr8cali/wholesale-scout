# Find suppliers page: build steps 3 and 4

**Goal:** a "Find suppliers" page on Wholesale Scout: type a product, choose wholesale or manufacturers, get suppliers with type, country, price and a link. Akin asked for this on 7 Nov after the [spike](../../supplier-search-spike-results.md) and left the decisions to Claude.

## Decisions

- **Serper only.** Brave's terms limit storing results and the page stores them. Cheaper too. The provider list stays configurable.
- **Sonnet 5.5.** Haiku matched only 52% of prices.
- **Prices labelled "check on page".** The spike's price check failed (85–86% against 90%). The price fixes go in, but there's no paid re-test unless Akin approves one.
- **One table.** `supplier_searches` keeps the results as JSON, because nothing queries inside them yet.
- **No page-read cache.** Added if repeat searches turn out to cost real money.
- **Left out (step 5):** Qogita offers, add to Suppliers, screening, contact details, quote requests.

## Limits

- Up to 15 readable pages per search (about $0.19). A search stops at $0.50.
- No new search once today's searches have cost $5.

## Tasks

1. **Guard.** Block the server's own sites and address gaps. Close `</page >`, and put the page address inside the data tags. Timeouts on search and AI calls.
2. **Prices.** Reject a price written as RRP, UVP or "was". Fill a blank currency from the sign in the quote. Prompt rules: only the product wanted, smallest-quantity price, and name the product line priced. Hide price-comparison sites.
3. **Results.** `readablePerProvider` option. Shared live dependencies for the script and the app. `toResults` turns a run into rows, best first.
4. **Server.** Migration, `src/lib/server/supplierSearch.ts`, `/api/supplier-searches` routes. The search runs in `after()`. A search still running after 10 minutes reads as failed. `jsdom` moves to `dependencies`.
5. **Page.** `/find-suppliers`, nav entry, Help article, `e2e/routes.ts`, env example, STATUS.
6. **Ship.** `npm test`, lint, build, `test:a11y`, `make migrate`, push, deploy. One real search, reporting its cost and how many pages the server could read, since a datacentre address may be blocked more than the Mac was.

## Needs Akin

- `SERPER_API_KEY` in the server's `.env`.
- Screenshots first, or a straight deploy.
- Yes to deleting the spot-check page.
