---
title: "Private label: finding suppliers"
summary: Search Alibaba with the right filters, send each results page to a candidate with the extension, let Supplier Scout score every listing against your target price and MOQ, message the top three with Copy RFQ, and add their quotes.
synonyms: [supplier scout, suppliers, alibaba, rfq, request for quote, factory, manufacturer, moq, ex-works, trade assurance, verified supplier, sourcing]
workspace: pl
order: 3
route: /pl/suppliers
---
**Supplier Scout** turns Alibaba search results into a ranked shortlist, so you only message the few suppliers worth it. The extension reads the results pages you open, in your own browser; nothing is fetched from Alibaba by the app.

## Set the targets first

In the candidate's **Gate 6**:

- **Target ex-works price**: what one unit of your product should cost at the factory gate. Blank, it's Gate 0's landed cost ÷ 1.4 (shown as **Derived**).
- **Most you'd order first (max MOQ)**: blank is 1,000.
- **One unit of our product is a**: box, piece, set, pack or bag. A listing priced per piece is converted when its title gives a single count ("200pcs" at £0.01 a piece is £2.00 a box).
- **Spec for suppliers**: size, count, material, packaging, printing. It goes into the RFQ.

Changing any of these (or the landed cost, the name or the niche keyword) scores the candidate's suppliers again.

## Search Alibaba

1. Search alibaba.com for the product. Use the filters **Verified Supplier**, **Trade Assurance**, **5+ years** and the right **category**.
2. The extension (version 0.5.0 or later) shows a panel at the bottom right with how many listings are on the page.
3. Click **Send suppliers to Private label**. The first time, pick the candidate; after that the button sends to the same one (**Change candidate** to pick another).
4. Go to the next results page and click **Send** again. Each page adds to the same list: a listing sent before is updated (price, MOQ, sold count) and keeps its status and notes.

With the Trade Assurance filter on, every listing on the page counts as Trade Assurance (Alibaba doesn't mark it card by card).

## How listings are scored (0–100)

| Part | Points | How |
|---|---|---|
| Price | 35 | The price per unit of your product, at the MOQ (the top of the listed range): full at or under the target, nothing at twice it. Priced per piece and yours is a box: × the count in the title. A unit or currency that can't be converted scores half and is flagged **Unit unclear** |
| MOQ | 20 | Full at or under your max, nothing at 5× it |
| Trust | 25 | 5+ years (6), rating 4.7+ (5), 10+ reviews (4), Verified (5), Trade Assurance (5); Verified Pro and Alibaba Guaranteed add 2 each, up to 25 |
| Relevance | 20 | The share of the product's words (from the candidate's name and niche keyword) in the title. A title with cloth, spray, bottle, machine, raw material, roll or jumbo (or microfibre, when the title isn't the product) is another product |

**Flags** never zero the score: **Not a factory?** (a trading company, or no "Co., Ltd" and no factory word), **Unit unclear**, **MOQ too high**, **Off product** (hidden by default) and **High price** (over the target). Hover a score to see its parts.

## Message the top three

**Copy RFQ** on the candidate's Suppliers section puts a message on the clipboard: the product, Gate 4's six words, your target ex-works price, your max MOQ, the spec, and a request for the FOB price at MOQ and 2× MOQ, unit weight, carton dimensions, lead time, sample cost and SDS/REACH/test reports. Lines with nothing to fill are left out. Edit the template in [Settings → Private label](/settings?tab=pl#rfq-template).

Open the top listings (**Listing**, **Store**), send the RFQ through Alibaba's chat, and click **Contacted**.

## Add their quotes

When a supplier answers, **Add quote** starts a quote in the candidate's **Quotes**, filled with the supplier, the price per unit of your product and the MOQ (links in its notes). Finish it there: the landed cost follows. **Reject** asks why and keeps the reason; **Notes** keeps anything else.

**Private label → Suppliers** lists every candidate's suppliers together, with a candidate filter. Home's **Suppliers** tile counts the ones to contact: new, scoring 60 or more, and on the product.
