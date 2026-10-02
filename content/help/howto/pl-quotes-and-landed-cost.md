---
title: "Private label: quotes and landed cost"
summary: Add supplier quotes to a candidate, turn each into a landed cost per unit and the cash a first order needs, check the price multiple, write it into Gates 0 and 7, choose a supplier, and generate the RFQ to send.
synonyms: [quotes, supplier quote, landed cost, rfq, request for quotation, alibaba, 1688, moq, freight, duty, import vat, commodity code, fx, price multiple, choose supplier]
workspace: pl
order: 3
---
**Private label → Quotes** lists every candidate with its quotes, chosen landed cost and price multiple (sort by any column); pick one to work on its quotes. Each candidate's page has the same **Quotes** section under its scorecard.

## Asking for quotes: RFQ text

**RFQ text** writes a supplier enquiry to copy into Alibaba, 1688 or an email: the product (the niche keyword) made to your differentiator (Gate 4's **The six words**, so fill that first), its packed size and weight when known, price tiers at **300, 500 and 1,000** units with the MOQ, retail packaging with an FNSKU label and FBA-ready cartons, the certifications and test reports to ask for in the candidate's category (food-contact reports for kitchen items, EN 71 and EN 14350 for baby products, UKCA/CE and RoHS for electricals, REACH for everything), samples to the UK and their cost, and the production lead time.

## A quote

**Add quote** adds a card; three sit side by side and more wrap below. Each has the supplier, **source** (Alibaba, 1688, UK wholesaler, Other), **contact** (a URL opens), **unit price** ex-works in its **currency** (USD, GBP, CNY, EUR), **MOQ**, **lead time**, **sample cost** and **sample lead time**, **notes**, and a **status**: requested, received, samples ordered, samples received, chosen, rejected. Changes save as you type.

## Landed cost

Under each quote, every input has a default you can change:

| Input | Default |
|---|---|
| Units ordered | the MOQ |
| FX rate | quote currency per £1: USD 1.27, EUR 1.17, CNY 9.2. Check today's rate on xe.com (linked) |
| Freight to the UK | £0 (the total for the shipment) |
| Duty | 0%. Find the rate for the product's commodity code in the UK Trade Tariff (linked). Duty is charged on goods + freight |
| Import VAT | on: 20% of goods + freight + duty |
| Inspection, Other | £0 |

**Import VAT** is a real cost while you're not VAT-registered. Once registered you reclaim it: turn it off, or read **per unit ex import VAT**.

It shows goods (unit price × units ÷ FX), freight, duty, import VAT, inspection and other, then **total cash required**, **landed cost per unit** (total ÷ units) and the **price multiple**: Gate 0's sell price ÷ landed, green from 3.5×, amber 3–3.5×, red under 3× (Gatekeeper's bands).

For example: $1.80 a unit, MOQ 500, FX 1.27, freight £180, duty 6.5%: goods £708.66, duty £57.76, import VAT £189.28, total £1,135.71, **£2.27 a unit** (£1.89 ex VAT).

## Writing it into the gates

- **Gate 0 landed cost ← this quote** writes the landed cost per unit into Gate 0, marked **Quote**.
- **Gate 7 first order ← this quote** writes the units ordered into Gate 7 (and the landed cost into Gate 0), so Gate 7's stock line is this order's total cash.

A value you typed yourself (**Manual**) is never overwritten: the page says it kept yours. Clear it in the gate to use the quote's.

## Choosing a quote

**Choose this quote** marks it **chosen** and stores its landed cost on the candidate (shown in the candidates list with "quote"). The other quotes are marked **rejected** unless you untick "mark the others rejected".
