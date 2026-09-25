---
title: Import a DG report
summary: There's no importer for Amazon's dangerous-goods reports; here's how DG data gets into the app instead.
synonyms: [dangerous goods, hazmat, dg report, hazmat report, sds, upload dg, classification]
order: 5
---
The app has no way to import a dangerous-goods (DG) report, such as a hazmat or DG classification report downloaded from Seller Central. There's no upload for it on any page and no API route for it. DG information reaches the app in three other ways.

## 1. Amazon's own data, automatically

When a product is matched on Amazon (SP-API catalogue), the app reads the listing's dangerous-goods attributes: the UN number, proper shipping name and transport class, GHS classes, and the heat-sensitive flag. The [Compliance category](/help/gates/compliance) gate checks this before any keyword:

| Amazon says | Rule it triggers |
|---|---|
| UN1950, "aerosol", class 2, or a GHS gas class | Aerosol |
| UN3480, UN3481, UN3090, UN3091, or "lithium" / "batter…" | Battery |
| Class 3, UN1266 and similar, "flammable" / "perfum…" / "alcohol", or GHS flammable | Hazmat: flammable liquid |
| Any other regulated entry or GHS hazard | Chemical |
| Heat-sensitive | Meltable |

The why-line reads, for example, "Aerosol (Amazon marks this as hazmat: UN1950, Aerosols, class 2.1)". You don't need to do anything for this.

## 2. Seller Central's classification, one product at a time

For a product Amazon has classified in Seller Central, the [Chrome extension](/help/pages/extension) can read the classification from the page and save it to the product. Click **Look up** in the extension's product panel, confirm **Hazmat**, **Not hazmat** or **Unknown** on the bar in Seller Central, and click **Save to the app**. Hazmat then counts in the compliance gate the next time the product is screened. See [Add a zero-quantity offer for DG review](/help/howto/zero-quantity-offer-for-dg-review) for the full steps.

## 3. Your own compliance rules

If a report tells you a whole kind of product is dangerous goods, add or edit a rule on [Settings](/help/pages/settings) → **Gates** → **Compliance rules**: add keywords (or a `/pattern/`) and Amazon categories, write the checklist, and click **Save rules**. Then set the rule's mode in each profile (off, warn or fail). Rules are shared by every profile and run on the row's own text before any API call.

## For one product you've cleared

If a report shows a product is fine but a keyword still flags it, [waive the gate](/help/howto/waive-a-gate) for that product with a reason such as "not DG per Amazon report".

## The only list importer

The one CSV importer in Settings is for IP-risk brands (**IP risk** → **Import a list**). It doesn't take DG data.
