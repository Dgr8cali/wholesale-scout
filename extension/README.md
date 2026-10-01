# Wholesale Scout for Chrome

Wholesale Scout's verdict on Amazon UK, where you browse:

- **Product pages**: a panel on the right with the verdict card: verdict, score, Buy Box, sales a month, sellers, your share, Amazon, gating (with Amazon's Apply link), the hurdle price or the most it can cost landed, and profit once you type a cost. Star it, put it on the watchlist (with the condition suggested from what blocked it) or open it in the app. Under the title: when it was checked ("checked 2 h ago", the exact time on hover) and **Re-check**. Amazon shows the date it was last seen as well as how long ago. While Keepa and gating are still running the card says "pending" and updates by itself. A product that fails a gate before any API call (compliance, budget) still shows the free Amazon data (Buy Box, sellers, Amazon now); sales and your share say "not fetched", with **Fetch anyway** to run the full check.
- **Search results**: a badge on each product with its verdict colour and score, from what the app already knows (nothing is screened, 20 per request). A grey **?** hasn't been checked: click it to check it.
- **Competitors' stock** (on request, per click): see below.
- **Dangerous goods**: "Look up" opens Seller Central for the ASIN; a bar there reads the classification and, when you confirm it, saves it to the product in the app. Hazmat counts in the compliance gate the next time the product is screened.
- **Opportunity Explorer → Gatekeeper** (on request, per click): send a Product Opportunity Explorer niche to the app's Private label page for Gates 3 and 5. See below.

## Install (load unpacked)

1. In Chrome, open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `extension/` folder.
4. Pin it: puzzle-piece icon → pin **Wholesale Scout**.
5. Click its icon, then enter:
   - **App URL**: `https://wholesale-scout.vercel.app` (or `http://localhost:3000` in development)
   - **APP_PASSWORD**: the same password the app asks for
6. Click **Save** (Chrome asks to allow access to the app's address: allow it), then **Test connection**. It should say "Connected".

After pulling a new version of the repo, click the reload arrow on the extension's card in `chrome://extensions`.

The password is kept in `chrome.storage.local` on this computer only and sent to your app as `Authorization: Bearer …`. Nothing is sent anywhere else.

## Settings

- **Check product pages automatically** (on): the panel checks each product page as it opens. A new ASIN becomes a check run in the app (Runs) and can spend a few Keepa tokens; a repeat within 12 hours reuses the last check. Off: the panel shows a **Check** button instead.
- **Show debug** (off): the stock reader's Debug section; see below.
- **Opportunity Explorer on .com and .de too** (off): also watch Opportunity Explorer on sellercentral.amazon.com and sellercentral.amazon.de. Saving with it on asks Chrome for access to those two sites.
- **Seller Central DG page**: the page "Look up" opens, with `{asin}` replaced. The default is Seller Central's product search; if another Seller Central page shows you the dangerous-goods classification, paste its address here.

## Competitors' stock: read this first

"Read stock" adds 999 of each FBA seller's offer to **your** Amazon cart, one seller at a time (4 seconds apart, at most 8 sellers), reads the quantity Amazon allows (or a "per customer" limit, which is marked as a limit, not stock), then removes it from your cart. It only runs when you click it, never automatically, and it refuses to run if the product is already in your cart.

- It uses your own Amazon session. Amazon's Conditions of Use prohibit automated data gathering, so use it sparingly and at your own risk to that account.
- How it reads: Amazon's all-offers (AOD) address answers 404 to a direct request, so the reader first fetches the product page with `?aod=1` (in case it arrives with the offers), then opens Amazon's own "See all buying options" panel on the page, waits for it to load (asking for more offers where it offers to), reads every `#aod-offer` (seller from "Sold by", `aod-offer-shipsFrom` = Amazon, offer listing ID) and closes it. Without a panel, it uses the Buy Box and "Other sellers on Amazon" rows. Each FBA offer is added by its listing ID with quantity 999; the number is read from **this ASIN's basket line only** (the basket lists every item's "Only N left"): a "limited to N per customer" or "only N left" message if there is one, else the quantity Amazon set, marked "allowed (stock or a per-customer limit: Amazon didn't say)". The line is removed and the removal checked.
- Amazon changes these pages without notice. When a step fails the panel says so for that seller rather than guessing, and with **Show debug** on (popup, off by default) a collapsed **Debug** section under the stock list holds a summary of what Amazon sent back at each step: **Copy** it and paste it to have the reader fixed (`allOffers`, `offersIn`, `offersOnPage`, `stockOf`, `removeLine` in `product.js`). Steps are recorded either way, so turning it on after a failed reading shows that reading.

Each seller shows when it was read ("read 25 Sept 21:14"); a reading over 7 days old is marked stale. Readings are saved to the product and shown in the app under "From the extension" in the row's details, and the panel shows the last saved reading until you read again.

## Dangerous goods: how the reading works

Seller Central's pages can't be read reliably, so the bar suggests hazmat / not hazmat / unknown from the page's text ("not dangerous goods" beats a mention of dangerous goods) and shows the words it read. You choose and click **Save to the app**. The look-up is remembered for 15 minutes.

## Opportunity Explorer capture: opt-in, per click

- **What it reads**: `poe-page.js` runs in the page's own world on `sellercentral.amazon.co.uk/opportunity-explorer/*` and wraps `fetch` (including `fetch(new Request(…))`, whose body it copies before the page's call) and `XMLHttpRequest` to *observe* the responses the page already receives: every `POST /ox-api/graphql` response with its operation name, and `/insightswidget-api/growth`. It never changes a request or a response, never makes a request of its own, and never reads the page's text or clicks anything. It passes a copy to `poe.js` by `postMessage`.
- **What it keeps**: every GraphQL response on the niche page you're on, by operation name, plus the insights widget's. The page's tabs load their data in separate calls, so they're merged. The niche itself is the exact operation `getNiche` (its `data.niche`); a list operation such as `getNiches` is kept as context but never taken for the niche. Moving to another niche, closing or reloading the tab forgets it. The panel's grey debug line lists the operations seen ("Seen: getNiche, getNiches ×2; insights ×1").
- **When it sends**: only when you click **Send to Gatekeeper** in the panel at the bottom right. The button appears only once `getNiche` has brought the niche; before that the panel says "No niche data yet". Nothing is scheduled and nothing is sent automatically. The panel's **Dismiss** hides it.
- **What it says back**: how many fields were filled, and which of the eight the app couldn't read (niche title, search volume, growth, products, top-3 click share, conversion, units per product, search terms). A capture with nothing readable says "captured but could not read 8 fields — raw saved", never success. The raw capture is stored either way, so the app can read it again after a parser fix (`POST /api/pl/poe/reparse`).
- **Where it goes**: `POST /api/pl/poe` on your app with `{ nicheId, title, raw }` and your password, through `background.js` like every other call. The app stores the capture, reads Gate 3 (search volume, growth, products, top-3 click share, conversion, units per product) and Gate 5 (head-term volume, long-tail count) from it, and attaches it to the candidate whose niche keyword is the niche's title. Otherwise the panel lists your candidates and **Attach** sends it to the one you pick (`/api/pl/poe/attach`).
- **Markets**: `.co.uk` only by default. `.com` and `.de` are optional permissions, registered only while the popup option is on.

## Limits

The app allows the extension 60 checks and 120 other requests a minute from one address; past that it answers 429 with the time to try again. Ten wrong passwords in 15 minutes block the address for 15 minutes.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Manifest V3: Amazon UK and Seller Central content scripts; the app's address is an optional permission granted on Save |
| `background.js` | Calls the app with the password (content scripts ask it by message) |
| `product.js` | The product-page panel, competitor stock |
| `search.js` | Search-results badges |
| `sellercentral.js` | The DG reading bar on Seller Central |
| `poe-page.js` | Opportunity Explorer, page world: observes every GraphQL and insights response the page receives |
| `poe.js` | Opportunity Explorer panel: merges the niche page's responses, Send to Gatekeeper, the candidate picker, what was and wasn't read |
| `popup.html`, `popup.js` | Settings and the connection test |

The app's endpoints are under `/api/extension/`: `check`, `lookup`, `star`, `watch`, `stock`, `dg` and `ping`; Opportunity Explorer captures go to `/api/pl/poe` and `/api/pl/poe/attach`.
