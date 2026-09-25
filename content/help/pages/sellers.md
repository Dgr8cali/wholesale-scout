---
title: Sellers
summary: Scan an Amazon seller's storefront and screen its listings, and see the sellers you've already scanned.
synonyms: [storefront, seller scan, competitor, merchant, seller id, keepa seller]
route: /sellers
order: 6
---
The Sellers page lists the Amazon storefronts you've looked up or scanned. **Scan a seller** screens a seller's listings as a run, so you can see which of the products they sell would work for you.

## The Sellers list

Each row is a seller whose storefront has been looked up through Keepa. The newest scan comes first, and the list shows up to 200 sellers.

| Column | What it shows |
|---|---|
| **Seller** | The seller's name, which links to their storefront on amazon.co.uk. Underneath are the business name (when it differs) and the seller ID. |
| **Rating** | Positive feedback %, with the number of ratings underneath. |
| **Storefront** | How many listings Keepa counts on the storefront, and "holds N% of its Buy Boxes" when Keepa knows. |
| **Brand mix** | The top five brands on the storefront, each with its listing count. When Keepa gives no brand breakdown, the brands of the scanned products are counted instead. |
| **Last scan** | When the last scan ran, linking to its run. Below that is a bar of pass, warn and fail results, for example "12 pass · 30 warn · 410 fail · 1,200 to go · holds Buy Box on 85". "holds Buy Box on" counts the scanned listings where this seller has the Buy Box. **Looked up, not scanned** means the storefront was fetched but no scan was started. |
| **Scan** / **Re-scan** | Opens Scan a seller with this seller already filled in. |

The **Scan a seller** button at the top right does the same with an empty form. You can also reach the scan form from a result's details: under **Top Buy Box sellers (365 days)**, each seller has a **Scan this seller** link. A brand's page has a **Scan** button next to each of its top sellers. See [Brands](/help/pages/brands).

## Scan a seller

A scan turns up to 2,000 of a seller's ASINs into a run. It works like [Check ASINs](/help/pages/check) with no cost, so for each listing you see the Buy Box, sales, sellers, Amazon, gating, the most it can cost landed ([max landed](/help/reference/glossary#max-landed)) and whether this seller holds the Buy Box.

### The form

| Control | What it does |
|---|---|
| **Seller ID or storefront link** | Paste an ID such as `A30PLPOC3L6XYK`, or a link that contains one: `amazon.co.uk/sp?seller=…`, `/s?me=…`, `/shops/…`, or links with `merchant=` or `smid=`. If there's no ID in it you'll see "That isn't a seller ID (A…) or a link with one (?seller=, ?me=)." |
| **Profile** | The screening [profile](/help/concepts/profiles) the scan uses. It starts on your default profile, marked "(default)". It decides which gates apply, and how old Keepa history can be before it's fetched again. |
| **Look up · 10 tokens** | Fetches the seller's storefront from Keepa. It only lights up when there's no cached copy. |

### The storefront cache and what a lookup costs

Keepa charges 10 tokens to fetch a storefront: 1 for the seller and 9 for the ASIN list. The app keeps the list for 7 days. When you type a seller ID:

- If a list was fetched in the last 7 days, the seller card appears straight away for free. The badge says **cached list · free**.
- If not, you'll see "No storefront for A… in the last 7 days. Looking it up costs 10 Keepa tokens; nothing is screened until you start the scan." Click **Look up · 10 tokens** to fetch it. The badge then says **looked up · 10 tokens**.

Looking up a storefront doesn't screen anything. Its 10 tokens are added to the run when you start the scan, so they show in that run's Keepa totals.

### The seller card

After a lookup (or straight away when the list is cached) you see:

- The seller's name, with a link to the storefront, their rating ("98% positive of 12,400 ratings"), their Buy Box share, and a link to the last scan if there's been one.
- Up to eight brands with their listing counts.
- **ASINs**: how many will be screened, for example "1,850 to screen". If the storefront has more than the 2,000 cap, the rest are counted but not scanned: "· 3,200 more on the storefront, over the 2,000 cap, not scanned". Keepa's own storefront size is shown underneath.
- **Keepa tokens**: the cost to start, and "N left now" (shown in amber if you don't have enough). The line underneath breaks it down. It gives the storefront lookup (if not yet billed), then history at 1 token per ASIN, skipping ASINs that already have history within the profile's max age (7 days by default). It also says "then up to 3 more for each row that passes every other gate", for the Buy Box data. If the total is more than your balance: "More than you have now: the scan waits for refills." See [Keepa tokens](/help/concepts/keepa-tokens).

**Start scan of N ASINs** creates the run, named "Seller scan · <seller name>", and takes you to it. The run carries on in the background like any other; see [Runs](/help/pages/runs).

## Things to know

- Scanned products have no cost, so the fee gate can't judge profit. Instead each row shows the most it can cost landed and still clear your profit floors. Use that figure when you ask a supplier for a price.
- Scanning a seller again within 7 days reuses the cached list. Only the history that has gone stale costs tokens.
- A scan's rows belong to a supplier called "Manual". It doesn't appear as a real supplier in the planner.
