---
title: "Private label: quotes and landed cost"
summary: Add supplier quotes to a candidate, turn each into a landed cost per unit and the cash a first order needs, compare them side by side with sample scores, write the best into Gates 0 and 7, choose a supplier, and generate the RFQ to send.
synonyms: [quotes, supplier quote, compare suppliers, comparison, sample scores, ddp, transit, next tier, exw, extras, plate fee, landed cost, rfq, request for quotation, alibaba, 1688, moq, freight, duty, import vat, commodity code, fx, price multiple, choose supplier]
workspace: pl
order: 3
---
**Private label → Suppliers & quotes → Quotes** (the old Quotes page; `/pl/quotes` opens it) lists every candidate with its quotes, chosen landed cost and price multiple (sort by any column); pick one to work on its quotes. Each candidate's page has the same **Quotes** section on its **Suppliers & quotes** tab, with a **List** / **Compare** switch (it remembers the one you used).

## Asking for quotes: RFQ text

**RFQ text** writes a supplier enquiry to copy into Alibaba, 1688 or an email: the product (the niche keyword) made to your differentiator (Gate 4's **The six words**, so fill that first), its packed size and weight when known, price tiers at **300, 500 and 1,000** units with the MOQ, retail packaging with an FNSKU label and FBA-ready cartons, the certifications and test reports to ask for in the candidate's category (food-contact reports for kitchen items, EN 71 and EN 14350 for baby products, UKCA/CE and RoHS for electricals, REACH for everything), samples to the UK and their cost, and the production lead time.

## A quote

**Add quote** adds a card; three sit side by side and more wrap below. Each has the supplier, **source** (Alibaba, 1688, UK wholesaler, Other), **contact** (a URL opens), **unit price** ex-works in its **currency** (USD, GBP, CNY, EUR), **MOQ**, the **next tier** (a larger order's unit price and its quantity, e.g. $2.85 at 1,000), **production** and **transit to FBA** days (the longest the supplier quoted), **notes**, and a **status**: requested, received, samples ordered, samples received, chosen, rejected. Changes save as you type.

- **Extras on the invoice**, in the quote's currency: **plate / setup**, **cards**, **shrink wrap** and **other**. With the units they make the **EXW total** (unit price × units + extras), and they're part of the landed cost.
- **Samples**: whether they're **not ordered**, **ordered** or **received**, the day they arrived, their cost and lead time, a score of 1–5 on each of the candidate's six criteria, and a note.
- **Spec**: four notes under the candidate's spec labels.

**Score labels** (in the Quotes header) names the six criteria and the four spec labels for this candidate. A new candidate starts with a generic set: build quality / finish, works as described, materials / feel, size / fit, packaging, durability; and product size, materials, box size / weight, shelf life / warranty. Lens cleaning wipes has its own (moisture / stays wet, cleaning / no streaks, smell, sachet opens easily, wipe size / feel, box quality; wipe size, sachet size / material, box size / weight, shelf life). Renaming a label keeps the scores and notes already given under it. **Reset to the generic set** puts the generic names back.

## Landed cost

Under each quote, every input has a default you can change:

| Input | Default |
|---|---|
| Units ordered | the MOQ |
| FX rate | quote currency per £1: USD 1.27, EUR 1.17, CNY 9.2. Check today's rate on xe.com (linked) |
| Freight | the mode (sea, rail, air, express) and **DDP** (delivered duty paid: the price includes duty and import VAT, so turning it on sets duty to 0% and import VAT off) |
| Freight to the UK | £0 (the total for the shipment) |
| Duty | 0%. Find the rate for the product's commodity code in the UK Trade Tariff (linked). Duty is charged on goods + freight |
| Import VAT | on: 20% of goods + freight + duty |
| Inspection, Other | £0 |

**Import VAT** is a real cost while you're not VAT-registered. Once registered you reclaim it: turn it off, or read **per unit ex import VAT**.

It shows goods (unit price × units ÷ FX), the extras (÷ FX), freight, duty, import VAT, inspection and other, then **total cash required**, **landed cost per unit** (total ÷ units) and the **price multiple**: Gate 0's sell price ÷ landed, green from 3.5×, amber 3–3.5×, red under 3× (Gatekeeper's bands).

For example: $1.80 a unit, MOQ 500, FX 1.27, freight £180, duty 6.5%: goods £708.66, duty £57.76, import VAT £189.28, total £1,135.71, **£2.27 a unit** (£1.89 ex VAT).

## Comparing quotes

**Compare** sets every quote side by side, one column each, in rows:

- **Price**: unit price (its currency and £), MOQ, the next tier.
- **Extras**: plate / setup, cards, shrink wrap, other, and the EXW total.
- **Freight**: mode, DDP, the freight cost in £.
- **Cost and profit**: landed per unit (ex import VAT once you're VAT-registered, as Gate 0 takes it), total cash required, the price multiple at Gate 0's sell price, and the **profit per unit after fees** (the sell price less referral, FBA, storage, inbound, prep and returns from Gate 6's fee figures, and the landed cost; before ads).
- **Lead time**: production, transit, and the day it would **arrive at FBA if ordered today** (production + transit; it needs both).
- **Samples**: status, cost, the day received.
- **Sample scores**: the candidate's six scores, editable here, their **average** and a note.
- **Spec**: the four spec notes, under the candidate's labels.

In each row the best value (the lowest cost, the shortest lead time, the highest score, multiple or profit) is tinted and marked with a trophy, and screen readers hear "best". Nothing is marked when only one quote has the value or they're all the same. On a phone it shows one supplier at a time: switch with the buttons above the card or swipe the card left or right.

**Make this the chosen supplier** (on any column but the chosen one, marked ★) asks first. It shows what changes: the quote becomes **chosen**, the one chosen before goes back to **received**, and Gate 0's landed cost and Gate 7's first order follow this quote (old → new). If you typed either value yourself, it asks whether to replace it; left unticked, yours stays.

## Writing it into the gates

- **Gate 0 landed cost ← this quote** writes the landed cost per unit into Gate 0, marked **Quote**.
- **Gate 7 first order ← this quote** writes the units ordered into Gate 7 (and the landed cost into Gate 0), so Gate 7's stock line is this order's total cash.

A value you typed yourself (**Manual**) is never overwritten: the page says it kept yours. Clear it in the gate to use the quote's.

## Choosing a quote

**Choose this quote** marks it **chosen** and stores its landed cost on the candidate (shown in the candidates list with "quote"). The other quotes are marked **rejected** unless you untick "mark the others rejected".
