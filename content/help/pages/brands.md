---
title: Brands
summary: Every brand you've screened, scored for how wholesale-friendly it is, with your approval status and IP risk.
synonyms: [brand map, wholesale-friendly score, ip risk, ungate, brand approval, brand gating]
route: /brands
order: 7
---
The Brands page rolls every product you've screened up by brand, so you can see which brands are worth chasing. Each brand gets a wholesale-friendly score from 0 to 100. On a brand's own page you can record where you stand on approval.

## Where the figures come from

Every product's latest result, from any run, is re-checked on your **default profile** (named at the top of the page) using the data already stored. Nothing is fetched from Keepa or Amazon to do this. When you save the default profile, or new results come in, the map is out of date. It then rebuilds in the background, and the page shows **Updating from the latest results…** and checks back every 5 seconds. On a first visit you may see "Building the brand map…" until it's done.

Brand names are matched however they're written: "La Roche-Posay", "LA ROCHE POSAY" and "la roche posay" are one brand. The most common spelling is the one shown.

## The wholesale-friendly score

The score is out of 100 and made of four parts:

| Part | Points | Full marks when |
|---|---|---|
| Gating | 30 | You can list it: Open or Approved scores in full. Applied scores 80%. Approval needed scores 70% when Amazon gives an apply link, else 40%. Blocked scores 0. Unknown scores 50%. |
| Amazon | 25 | Amazon never sells it. The points shrink in line with the share of its listings Amazon sells or sold. |
| Sellers | 20 | 2 to 8 FBA sellers on average. 1 to 2 sellers or 9 to 12 score half. Fewer than 1 scores 30%, and more than 12 scores 20%. |
| Passing ASINs | 25 | 5 or more ASINs pass or warn. 3 to 4 score 80%, 2 score 60%, 1 scores 40%, and none scores 0. |

Anything unknown scores in the middle. A brand on your IP-risk list at **high** has its score **halved**. The score is green from 70, amber from 50, and grey below that.

## The list

### Filters

| Control | What it does |
|---|---|
| **Find a brand or supplier** | Filters by brand name, or by the name of a supplier that carries it. |
| **All** / **Can list** / **Approval needed** / **Approved** / **Blocked** | Filters by gating. **Can list** shows Open and Approved brands. **Approval needed** shows brands that need approval, whether or not you've applied. |
| **Has passing ASINs** | Shows only brands with at least one product that passes or warns. |

The count next to the filters says how many brands are shown, for example "42 of 380 brands". The list shows 200 at a time. **Show N more** adds the next 200.

### Columns

Click any column heading except Gating and Carried by to sort by it. Click it again to reverse the order.

| Column | What it shows |
|---|---|
| **Brand** | Links to the brand's page. |
| **Score** | The wholesale-friendly score. |
| **ASINs** | Distinct ASINs seen in any run. |
| **Pass / warn** | Products that pass or warn on your default profile. Only products that have a price are counted. |
| **Sellers** | Average number of FBA sellers. |
| **Amazon** | The share of its listings that Amazon sells or has sold. It shows in red at 50% or more. |
| **Buy Box** | Average Buy Box. |
| **Max landed** | The median across its products of the most a unit can cost landed and still clear your profit floors. See [max landed](/help/reference/glossary#max-landed). |
| **Gating** | **Open**, **Approved**, **Applied**, **Approval needed**, **Blocked** or **Unknown**. Your own approval record wins. Otherwise it goes on what Amazon said on its listings: Open if any listing is open, then Approval needed, then Blocked. When approval is needed, the arrow icon opens Amazon's request-approval page in Seller Central. |
| **IP risk** | **high**, **medium** or **low** if the brand is on your IP-risk list. Hover over it for the note and source. A "?" after it means the source is marked unverified. |
| **Carried by** | Up to two suppliers that offer it (with "+N" for the rest), and how many Buy Box sellers have been seen on its listings. |

## A brand's page

Click a brand to open its page.

### The header

- The brand name and its score.
- If it's on your IP-risk list, a line such as "IP risk (high): Files counterfeit complaints · score halved", with an **edit** link to the IP-risk tab in [Settings](/help/pages/settings).
- The gating badge and "Carried by …", or "No supplier offers it yet".
- **Apply on Amazon**: opens Amazon's request-approval page, when there is one. See [Apply for brand approval](/help/howto/apply-for-brand-approval).
- **Mark approved**: records the brand as approved with today's date. You'll see "<Brand> marked approved; runs treat it as open when next screened". The button disappears once the brand is approved.

### Stats

**ASINs**, **Pass / warn**, **Avg sellers**, **Amazon**, **Avg Buy Box**, **Median max landed** and **IP risk**. They mean the same as the columns in the list. Hover over one for its explanation.

### Your approval

Three fields. Each saves as soon as you change it (the text box saves when you click away):

| Field | What it's for |
|---|---|
| Status | **Not applied**, **Applied**, **Approved** or **Refused**. Picking one fills in today's date if the date is empty. |
| Requirement | What Amazon asked for, for example "3 invoices, 30 units". It's a note for you only. |
| Date | When the status last changed. |

What the status changes:

- **Approved**: the brand shows as Approved and scores full marks for gating. The next time one of its products is screened, the [gating gate](/help/gates/gating) passes it as "Open: brand approval for <brand> recorded as approved". The exception is when Amazon also wants category or product approval. On the [Watchlist](/help/pages/watchlist), a "Brand approved" condition is met.
- **Refused**: the brand shows as Blocked.
- **Applied**: the brand shows as Applied instead of Approval needed, and scores 80% for gating.

### Top sellers of this brand

These are the three sellers seen most often on its listings, either as a top Buy Box seller or as the seller that holds the Buy Box now. Each has a **Scan** button that opens [Scan a seller](/help/pages/sellers). Buy Box sellers are only looked up for products that pass every gate, so this list can be empty: "No Buy Box sellers known yet".

### Products across all runs

This is one row per product, with the best offer for each EAN.

| Column | What it shows |
|---|---|
| **Product** | Thumbnail, title, EAN, ASIN (links to Amazon) and **latest run**. |
| **Verdict** | pass, warn or fail on your default profile. It shows "—" for a product that was never priced, which isn't judged. |
| **Buy Box**, **Sellers** | The latest figures. |
| **Amazon** | "sells / sold" (in red) or "no". |
| **Max landed** | The most a unit can cost landed and still clear the floors. |
| **Best offer** | The cheapest costed offer: its ex-VAT price, the supplier, and the MOQ. Hover over it to see when it was seen. It says "no costed offer" if there isn't one. |
| **Gating** | Open, Approval (with an apply link) or Blocked, as Amazon said for this listing. |

## Related

- [Score](/help/concepts/score): the per-product score, which is a different thing from the brand score.
- [Compliance gate](/help/gates/compliance): how IP-risk brands are flagged on individual products.
