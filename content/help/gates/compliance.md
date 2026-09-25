---
title: Compliance category
summary: Flags hazmat, liquids, cosmetics, supplements, IP-risk brands and other categories that need paperwork or approval.
synonyms: [hazmat, dangerous goods, dg, restricted category, ip risk, meltable, aerosol, rules]
gate: compliance
order: 2
---
The compliance gate flags products in categories that need extra paperwork, a dangerous-goods review or care in FBA: fragrance, aerosols, batteries, cosmetics, food and so on. It also flags brands on your IP-risk list.

## What it checks

It matches a set of compliance rules against the product. Each rule can be matched in three ways, in this order:

1. **Amazon's own dangerous-goods data** for the listing (hazmat UN number, shipping name and class, GHS classes, heat-sensitive). This wins over keywords for the same rule.
2. **Keywords** in the row's own text (the supplier's product name, brand and category, plus the Amazon title once matched). Keywords match whole words or phrases; `/pattern/` is a regular expression.
3. **Amazon category**: the listing's category is one of the rule's categories.

The **IP-risk brand** rule matches the product's brand against your list in Settings, **IP risk** tab.

The shipped rules are: Hazmat: flammable liquid, Liquid, Aerosol, Cosmetic, Supplement, Food, Electrical, Battery, Under-3s toy, Chemical, Meltable and IP-risk brand.

### How the status is worked out

- Rules set to **off** are ignored.
- Nothing matched: pass.
- The gate fails only when the gate's mode is **fail** and at least one matched rule is set to **fail**. The IP-risk rule on **fail** only fails **high**-risk brands; medium and low only warn.
- Anything else that matched is a warn.

So a rule on **fail** inside a gate on **warn** only warns.

## When it runs

- **Before any API call**, on the row's own text (keywords and the supplier's category). A fail here costs nothing.
- **Again on every later pass**, once the catalog lookup has brought in Amazon's category and dangerous-goods data. So a product can pass on its text and be flagged later by Amazon's data.

## Settings

Settings, **Gates** tab, card **2 Compliance category** (Needs: Row).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **warn** | Switches the whole gate: **off**, **warn** or **fail**. |
| A mode per rule | **warn** for every rule | **off** ignores that rule; **warn** flags it; **fail** drops the row when the gate is also on **fail**. |
| **Flag liquids only above** (ml) | empty | Empty flags every liquid. A number (for example 250) only flags the Liquid rule when the largest volume in the text is over it, so small bottles pass. |

The rules themselves (names, keywords, Amazon categories, notes and checklists) are in the **Compliance rules** section below the gates. They are shared by every profile; each profile only sets each rule's mode. The IP-risk list is on the **IP risk** tab.

## Mode in each profile

| Profile | Gate mode | Rule modes |
|---|---|---|
| First order (default) | fail | Hazmat: flammable liquid, Aerosol, Supplement, Food and Under-3s toy **fail**; the rest **warn** (Liquid only above 500 ml) |
| Strict | fail | every rule **fail** |
| Test order | warn | every rule **warn** |
| Dry goods only | fail | Hazmat: flammable liquid, Liquid, Aerosol, Cosmetic, Supplement and Chemical **fail**; the rest **warn** |

First order sets **Flag liquids only above** to 500 ml, so the Liquid rule only flags a liquid whose largest volume in the text is over 500 ml (why-line e.g. "Liquid (750 ml, over 500 ml)"); a liquid with no volume found isn't flagged. Liquid only warns there. None of the other shipped profiles sets it.

## Reading the why-line

Each matched rule reads `Rule name (reason)`, several joined with "; ".

| Source | Example | Meaning |
|---|---|---|
| Keyword | Aerosol (keyword match: dry shampoo) | The text contains a rule keyword, shown as written in the row. |
| Amazon category | Cosmetic (category Beauty) | The listing's Amazon category is on the rule. |
| Amazon hazmat data | Hazmat: flammable liquid (Amazon marks this as hazmat: UN1266, Perfumery products, class 3) | Amazon's transport data. Class 2 or UN1950 maps to Aerosol, lithium batteries to Battery, class 3 and flammables to Hazmat: flammable liquid, anything else to Chemical. |
| Amazon GHS | Hazmat: flammable liquid (Amazon marks this as flammable under GHS) | Also "Amazon marks this as a pressurised gas under GHS" (Aerosol) or "Amazon marks this as hazardous under GHS: …" (Chemical). |
| Amazon, other | Chemical (Amazon marks this as regulated: …) | Amazon lists a regulation but no hazmat class. |
| Amazon batteries | Battery (Amazon lists batteries included or required) | |
| Amazon heat-sensitive | Meltable (Amazon marks this as heat-sensitive) | FBA only takes meltable stock mid-October to mid-April. |
| Liquid volume | Liquid (500 ml, over 250 ml) | Shown when **Flag liquids only above** is set. |
| IP-risk list | IP risk (high): Files counterfeit complaints on Amazon UK | The brand is on your IP-risk list, with its level and your note. |

Other outcomes:

- pass: "No compliance rule matched".
- off: "Gate off in this profile".

Matches from Amazon's data add the tag AMAZON_DG. Compliance flags also lower the Risk group of the [score](/help/concepts/score).

## What to do about a fail

- Open the rule's checklist in **Compliance rules** and see whether you can meet it (safety data sheet, UK Responsible Person, category approval).
- If a keyword is matching the wrong thing (for example "oil" in a non-liquid name), edit the rule's keywords.
- For hazmat, you can find out Amazon's view without buying stock: [make a zero-quantity offer for DG review](/help/howto/zero-quantity-offer-for-dg-review), then [import the DG report](/help/howto/import-a-dg-report).
- To relax a rule or the gate, [change a threshold](/help/howto/change-a-threshold) (set the rule to **warn** or **off**, or set a liquid volume).
- To accept this one product, [waive the gate](/help/howto/waive-a-gate).
