---
title: Add a zero-quantity offer for DG review
summary: Create a zero-stock offer in Seller Central so Amazon classifies the product for dangerous goods, then save the result to the app with the extension.
synonyms: [dangerous goods, hazmat, dg review, sds, safety data sheet, fba dg, classification]
order: 4
---
Some products (perfume, aerosols, lithium batteries, many chemicals) are dangerous goods (DG) and need Amazon's hazmat review before FBA will take them. A common way to find out how Amazon classifies a product before you buy stock is to add an offer with zero quantity in Seller Central. The app can't create that offer for you: you do it in Seller Central, then bring the result back into the app with the [Chrome extension](/help/pages/extension).

## What the app already tells you

The [Compliance category](/help/gates/compliance) gate flags likely DG before you spend anything:

- **Amazon's own data** (from SP-API): a UN number, transport class, GHS class or heat-sensitive flag on the listing. The why-line says so, e.g. "Aerosol (Amazon marks this as hazmat: UN1950, Aerosols, class 2.1)". The row is tagged AMAZON_DG.
- **Keywords** in the product's name, for rules like Hazmat: flammable liquid, Aerosol, Battery and Chemical, e.g. "Hazmat: flammable liquid (keyword match: Eau de Toilette)".

Those rules come with a checklist, for example "Safety data sheet (SDS) from supplier", "FBA dangerous goods review submitted", "UN number and flash point confirmed". You can edit the rules on [Settings](/help/pages/settings) → **Gates** → **Compliance rules**.

## Add the zero-quantity offer (in Seller Central)

These steps happen in Seller Central, not in the app. Amazon changes its screens, so the labels may differ a little.

1. In Seller Central, go to **Catalogue** → **Add Products** and search for the ASIN.
2. Choose to sell it, set the condition to New, your price and SKU, set **quantity to 0**, and choose Amazon to fulfil it (FBA).
3. Save. Amazon reviews the listing's dangerous-goods data. If it needs more, it asks for a safety data sheet (SDS) or an exemption sheet from you, usually via the listing's status or the dangerous goods pages in Seller Central.
4. Wait for the classification. Amazon will show whether the product is hazmat (dangerous goods) or not.

## Bring the result back into the app

You need the Chrome extension set up; see [Set up the extension](/help/howto/set-up-the-extension). The product must already have been checked in the app, or saving fails with "Check this ASIN first".

1. Open the product's page on amazon.co.uk. In the Wholesale Scout panel, find "Dangerous goods: Seller Central's classification" and click **Look up**.
2. The extension opens Seller Central for that ASIN. By default this is product search (`sellercentral.amazon.co.uk/product-search/search?q={asin}`). If another Seller Central page shows you the classification, put its address in the extension's **Seller Central DG page** setting.
3. A bar appears at the bottom of the Seller Central page: "Wholesale Scout · DG for B07BJK336Z:" (with your ASIN). It reads the page and suggests **Hazmat**, **Not hazmat** or **Unknown**, showing the words it read ("Read on the page: …"). "Not dangerous goods" beats a mention of dangerous goods.
4. Check the suggestion, pick the right one, and click **Save to the app**. The bar says, for example, "Saved: B07BJK336Z is hazmat in the app." **Dismiss** closes it without saving. The look-up is remembered for 15 minutes.

## What it changes in the app

- The row's details show it under **From the extension**: "Seller Central DG: hazmat · Class 3 flammable · 25 Sept".
- **Hazmat** is added to the product's Amazon DG data. The next time the product is screened or re-screened, the compliance gate counts it. If Amazon's own data hadn't already triggered a rule, it shows under the Chemical rule, e.g. "Chemical (Amazon marks this as regulated: Seller Central: Class 3 flammable)".
- **Not hazmat** and **Unknown** are recorded for you to see, and take back a hazmat mark an earlier Seller Central reading added. They don't clear a keyword match: a perfume still matches Hazmat: flammable liquid by its name. If you're satisfied, [waive the gate](/help/howto/waive-a-gate) for that product, or set the rule to warn or off in your profile.

The hazmat mark stays when the product's Amazon catalogue data is read again later (for example on a new upload): Amazon's fresh data is kept alongside it. To clear it, look the product up again and save **Not hazmat** or **Unknown**, which replaces the Seller Central entry.
