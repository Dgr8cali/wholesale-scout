---
title: Suppliers
summary: One record per supplier, with their terms and paperwork, how their products screen, and the MOV used by the budget gate.
synonyms: [supplier ledger, wholesaler, distributor, mov, minimum order value, vendor, terms]
route: /suppliers
order: 8
---
The Suppliers page keeps one record for each supplier: their terms, your paperwork notes, and how their products screen on your default profile. A supplier's **MOV** (minimum order value) also feeds the [budget gate](/help/gates/budgetFit) and the [order planner](/help/pages/plan).

Suppliers are created for you. A new one appears the first time you upload a price list under a new supplier name, or pull from [Qogita](/help/pages/qogita). [Check ASINs](/help/pages/check) and [seller scans](/help/pages/sellers) go under a supplier called "Manual".

## The list

**Find a supplier or brand** filters by supplier name, or by a brand the supplier carries. The most-used suppliers (by products seen) come first.

| Column | What it shows |
|---|---|
| **Supplier** | The name, which links to the supplier's page, plus a website link if you've added one. Underneath is the source (Upload, Qogita or Manual) and when their last offer was seen. |
| **Runs** | How many runs included their offers. |
| **Products** | Distinct products they've offered. |
| **Pass / warn** | Their products that pass or warn on your default profile. Only products with a price are counted. |
| **Brands** | Their top three brands, and "+N" for the rest. |
| **Terms** | Currency, "ex VAT" or "inc VAT", the MOV if one is set, and delivery days. |
| **Paperwork** | "IoR yes/no/—" (importer of record), labelling (UK, EU or mixed), and "invoice yes/no/—" (whether their invoice is accepted for brand approval). |
| **Rating** | Your 1 to 5 star rating. |

## A supplier's page

The header shows the source, the number of runs, the number of products seen, and pass and warn counts on your default profile.

### The record

Every field saves on its own. Text and number boxes save when you click away, and drop-downs save as soon as you pick. **Saved** appears at the top right. A value that isn't allowed shows an error instead, for example "delivery days must be a whole number between 0 and 365".

| Field | What it's for |
|---|---|
| **Website** | Their site. "https://" is added if you leave it off. |
| **Contact** | Name, email, phone. |
| **Payment terms** | For example "pro forma, 30 days". |
| **Rating (1–5)** | Your own rating, or **Not rated**. |
| **VAT basis of prices** | **Ex VAT** or **Inc VAT**: whether their price lists include VAT. When you pick this supplier on [Upload](/help/pages/upload), the upload starts from this value (and the currency below), and what you choose there is saved back to the record. |
| **Currency** | A three-letter code such as GBP or EUR. |
| **MOV (currency)** | Minimum order value, in the supplier's currency. Leave it empty for none. Allowed values are 0 to 1,000,000. See below. |
| **Delivery (days)** | Typical delivery time, 0 to 365. For Qogita this is filled in once from Qogita's own delivery estimates (the median, in weeks × 7) while the field is empty. |
| **Importer of record** | **Unknown**, **Yes** or **No**. Whether they act as importer of record. |
| **Labelling** | **Unknown**, **UK**, **EU** or **Mixed**. |
| **Invoice name matches your account** | **Unknown**, **Yes** or **No**. |
| **Invoice accepted for brand approval** | **Unknown**, **Yes** or **No**. Useful when you [apply for brand approval](/help/howto/apply-for-brand-approval). |
| **Invoice notes**, **Notes** | Free text. |

### How the MOV is used

The MOV only matters for price-list lines that have **no MOQ of their own**. For those lines, the budget gate sizes the first order so that it reaches the MOV. The MOV is converted to pounds at the offer's exchange rate. For example, a £150 MOV with £5 items needs 30 units:

- If those 30 units at the landed cost fit your line cap, the gate passes with "First order £165.00 of £1,000.00 (30 units to reach the supplier's £150.00 minimum order)". The figures depend on your fees.
- If they don't fit, the gate fails (or warns, depending on its mode) with a line such as "No line MOQ: the supplier's £150.00 minimum order is 30 × £5.50 = £165.00, over the £100.00 line cap; 18 units fit".
- If the MOV is more than your whole budget, the gate fails with "Supplier minimum order £1,500.00 is over the £1,000.00 budget".

A line with its own MOQ uses that MOQ, not the MOV. A change to the MOV applies the next time the products are screened, so re-screen the run to see its effect. Qogita lines use the MOV of the Qogita seller chosen for each product, not this record. In the [order planner](/help/pages/plan), a supplier is only ordered from if its lines add up to its MOV on goods ex VAT.

### Best products

These are up to 10 of the supplier's products that pass or warn on your default profile. Passes come first, then the most **Room**, which is how far their landed cost comes in under the [max landed](/help/reference/glossary#max-landed) cost. The columns are **Verdict**, **Buy Box**, **Landed** (their cheapest price, landed with your default profile's fees), **Max landed** and **Room**. If nothing qualifies: "None of its costed products pass or warn on your default profile."

### Brands carried and Runs

**Brands carried** lists up to 30 of the brands they offer, with product counts. **Runs** lists the 20 most recent runs that included their offers, each linking to the run.
