---
title: Chrome extension
summary: Wholesale Scout's verdict on Amazon UK product and search pages, competitor stock on request, and Seller Central dangerous-goods look-ups.
synonyms: [chrome, browser extension, plugin, add-on, amazon panel, competitor stock, hazmat lookup, dg]
order: 13
---
The Chrome extension shows Wholesale Scout's verdict while you browse Amazon UK. A panel on each product page gives the verdict card. Search results get a small badge on each product. The panel can also read competitors' stock (only when you click) and look up the dangerous-goods classification in Seller Central. Everything it checks becomes a normal run in the app.

To install it, see [Set up the Chrome extension](/help/howto/set-up-the-extension).

## The popup (settings)

Click the extension's icon in the Chrome toolbar to open its settings:

| Setting | Default | What it does |
|---|---|---|
| **App URL** | `https://wholesale-scout.vercel.app` | Your app's address. "https://" is added if you leave it off. |
| **APP_PASSWORD** | empty | The password the app asks for. It's stored on this computer only (in Chrome's local extension storage) and sent only to your app. |
| **Seller Central DG page** | `https://sellercentral.amazon.co.uk/product-search/search?q={asin}` | The page **Look up** opens, with `{asin}` replaced. If another Seller Central page shows you the dangerous-goods classification, paste its address here. |
| **Check product pages automatically** | on | The panel checks each product page as soon as it opens. When it's off, the panel shows a **Check** button instead. |
| **Show debug** | off | Adds a **Debug** section under the competitor stock list, showing what Amazon sent back at each step of a stock reading. Turn it on when the stock reader needs fixing. It takes effect on open panels straight away. |

- **Save**: stores the settings. The first time (or after changing the App URL) Chrome asks for permission to reach the app's address. Allow it, or you'll see "Allow access to the app's address to connect."
- **Test connection**: saves, then asks the app. "Connected: the app accepted the password." means it works. "Wrong password" means the password is wrong. "Couldn't reach …" means the URL is wrong, or access wasn't allowed.

## The product page panel

On any amazon.co.uk product page, a panel sits on the right. The **Wholesale Scout** tab on its edge, or the **×** in the panel, collapses and reopens it. Whether it's open is remembered.

If the extension isn't set up yet, the panel says "Open the extension's popup (its toolbar icon) and set the app URL and password."

### Checking a product

With **Check product pages automatically** on, the panel checks the ASIN when the page opens. With it off, you'll see "Not checked yet. A new ASIN is a check run in the app (a few Keepa tokens)." and a **Check B0…** button.

A check works like [Check ASINs](/help/pages/check): it creates a run in the app, which you can find on [Runs](/help/pages/runs). Your default profile is used. It can spend a few [Keepa tokens](/help/concepts/keepa-tokens). A check of the same ASIN and cost within the last **12 hours** is reused rather than screened again.

While Keepa and gating are still running, the badge says **screening** with "pending: Keepa and gating still coming". The panel checks back every 5 seconds, for up to about 3 minutes, and fills in by itself.

### The verdict card

- **Verdict badge** (pass, warn or fail, in colour) and **Score**. See [Score](/help/concepts/score).
- The product title, then "checked 2 h ago · **Re-check**". Hover over the time for the exact date and time. **Re-check** screens it again now instead of reusing the check.

| Field | What it shows |
|---|---|
| **Buy Box** | The current Buy Box price. |
| **Sales / mo** | Estimated sales a month. |
| **Sellers** | The number of sellers. |
| **Your share / mo** | Your expected sales a month if you join. See [your share](/help/reference/glossary#your-share). |
| **Amazon** | "selling now", "last seen 12 Sept 2026 (13 days ago)", "never" (not in the Keepa history), or "not now". |
| **Gating** | Open, Approval needed or Blocked, with an **Apply** link when Amazon offers one. See [Apply for brand approval](/help/howto/apply-for-brand-approval). |
| **Hurdle (sell at)** / **Max landed** | With a cost: the [hurdle price](/help/reference/glossary#hurdle-price), which is the sell price that clears your floors. Without a cost: the [max landed](/help/reference/glossary#max-landed) cost, which is the most it can cost landed. |
| **Profit at £X** / **Profit** | The profit at your landed cost, or "needs a cost". |

Under the grid is the why-line, the same one the app shows for the row.

### Not fetched, and Fetch anyway

Some products fail a gate before any paid call is made, for example at [compliance](/help/gates/compliance) or [budget fit](/help/gates/budgetFit). The card still shows the free Amazon data: Buy Box, sellers and Amazon now, from the current offers. **Sales / mo** and **Your share / mo** say "not fetched". A grey box explains: "Not fetched: failed at compliance. Buy Box, sellers and Amazon are from current offers; sales, your share and history weren't fetched." **Fetch anyway** screens it again and fetches every source past the gate that stopped it. This spends Keepa tokens.

### Cost and actions

| Control | What it does |
|---|---|
| **Your landed cost, £ (optional)** | Type your landed cost per unit. Shortly after you stop typing, the card is checked again with that cost, so profit and the hurdle price fill in. A value that isn't a positive number shows "That isn't a cost." |
| **☆ Star** | Stars the product in the app ("Starred"). See [Favourites](/help/pages/favourites). |
| **Watch** | Puts it on the [Watchlist](/help/pages/watchlist) with the condition suggested from what blocked it ("On the watchlist"). |
| **Open in app** | Opens the check's run in the app in a new tab. |
| **Re-check** | Shown while there's no finished check yet, or while it's pending. It screens again now. |

**Star** and **Watch** need the product to have been checked first. Otherwise you'll see "Check this ASIN first".

## Search result badges

On Amazon search pages, each product gets a round badge at the top left of its image:

| Badge | Meaning | Click it to |
|---|---|---|
| Green, amber or red, e.g. "PASS 78" | The latest verdict and score the app already has, from any run | Open that run in the app |
| "…" | Still screening | Open the run |
| Grey "?" | Not checked by Wholesale Scout | Check it now. This is a check run and spends a few Keepa tokens. The badge then updates. |
| "!" | The check failed | Hover over it to see why |

The badges only show what the app already knows. Nothing is screened until you click a "?". They're fetched 20 at a time, and results that load later (more pages, new filters) get badges too.

## Competitors' stock

The **FBA competitors' stock** section at the bottom of the panel reads how many units each FBA seller has. It only runs when you click **Read stock** (or **Read again**).

**Read this first.** It uses your own Amazon session and your own basket. For each FBA seller in turn it adds 999 of their offer to your basket, reads what Amazon allows, then removes it. Amazon's Conditions of Use prohibit automated data gathering, so use it sparingly and at your own risk to that account.

How it works:

- It refuses to run if the product is already in your basket: "This product is already in your cart: remove it first so the reading is only the seller's."
- It finds the offers by opening Amazon's own "See all buying options" panel. If there's no panel, it uses the Buy Box and "Other sellers on Amazon" rows. Only FBA sellers are read, not Amazon itself, and at most 8, one at a time and 4 seconds apart. The panel shows "Reading <seller> (2 of 5)…" as it goes.
- The number comes from this ASIN's basket line only. If Amazon shows a "limited to N per customer" message, the number is a limit, not stock. If Amazon shows "only N left", that's the stock. If Amazon just sets the quantity with no message, the number could be either.
- Each line is removed from your basket and the removal is checked. If it can't be removed you'll see "added, but couldn't remove it from your basket: please remove it by hand".

Each seller shows as:

- **12**: the stock.
- **3 (per-customer limit, not stock)**: Amazon capped the quantity per customer.
- **20 allowed (stock or a per-customer limit: Amazon didn't say)**: Amazon set the quantity without saying why.
- **?** plus an error: that seller couldn't be read. The panel says why for that seller rather than guessing.

Under each seller is when it was read ("read 25 Sept 21:14") and where the number came from. A reading over **7 days** old is marked **(stale)** in red.

When it finishes, the reading is saved to the product ("Stock saved to the app."). In the app it shows in the row's details under **From the extension**. Next time you open the page, the panel shows the last saved reading ("Last reading saved in the app:"), or "Last reading is over 7 days old (stale): read again for today's stock."

If no sellers can be found you'll see "No FBA seller offers with an offer listing ID found. Turn on Show debug in the extension's settings and paste the Debug section to fix the reader."

### Debug

With **Show debug** on in the popup, a collapsed **Debug (N steps)** section appears under the stock list. It holds a summary of what Amazon sent back at each step. **Copy** puts it on your clipboard ("Debug copied."), ready to paste to whoever fixes the reader. Steps are recorded whether or not Show debug is on, so turning it on after a failed reading shows that reading.

## Dangerous goods look-up

At the bottom of the panel, "Dangerous goods: Seller Central's classification" has a **Look up** button. It opens the **Seller Central DG page** from your settings for this ASIN, in a new tab. You need to be signed in to Seller Central.

On that page a bar appears at the bottom: "Wholesale Scout · DG for B0…:" with three choices, **Hazmat**, **Not hazmat** and **Unknown**. The bar reads the page as it loads and suggests one. "Not dangerous goods" beats a mere mention of dangerous goods. It shows the words it read ("Read on the page: "…""), or "Nothing found yet: pick what Seller Central says." Seller Central's pages can't be read reliably, so check the suggestion and pick the right answer.

- **Save to the app**: saves your choice to the product ("Saved: B0… is hazmat in the app."). If you save **Hazmat**, it's added to the product's Amazon dangerous-goods data, so the [compliance gate](/help/gates/compliance) counts it the next time the product is screened. In the app the classification shows under **From the extension** in the row's details.
- **Dismiss**: closes the bar without saving.

The bar only appears within 15 minutes of clicking **Look up**. The product must have been checked in the app first. For a whole Seller Central report instead of one ASIN at a time, see [Import a DG report](/help/howto/import-a-dg-report).

## Updating the extension

After you pull a new version of the app's code, open `chrome://extensions` and click the reload arrow on the Wholesale Scout card.
