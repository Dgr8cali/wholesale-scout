# Supplier search spike: results (7 Nov 2026)

**Result: two of the three areas passed, and wholesale failed on price accuracy.** Finding suppliers and telling them apart by type works. Prices aren't reliable enough yet, and most factories don't publish one. Akin still has to decide whether to go ahead. Nothing has been built on Wholesale Scout.

**These grades came from an AI, not from Akin.** Akin chose not to grade 362 rows by hand. Claude Opus 5.5, a different and stronger model than the one that produced the results, graded them from the saved pages without knowing which provider found each row. So treat the scores as a good estimate, not as a buyer's judgement. It can only judge what the page says, and it can't check whether a supplier's claims are true.

## Scores

Both providers were run on 20 products: 8 manufacturer-seeking, 6 branded and 6 generic.

| Area | Check | Pass mark | Serper | Brave |
|---|---|---|---|---|
| **Manufacturers: go** | Products with at least 3 confirmed factories (of 8) | 6 | 6 | 8 |
| | Manufacturer labels right | 70% | 82% | 86% |
| **Wholesale: stop** | Right product | 80% | 94% | 92% |
| | Prices read right | 90% | **86%** | **85%** |
| **Country: go, with a caveat** | Countries right | 90% | 100% | 100% |
| | Country unknown | 40% or less | 15% | 6% |

**Don't trust the 100% on country.** The grader marked 248 rows right, 2 unsure and none wrong. It reads the same page the country came from, so this mostly shows the page supports the answer. It doesn't show the business is really based there. One grader note says a supplier with a London phone number is really Canadian.

## Prices

| Group | Pages with a price |
|---|---|
| All opened pages in the sheet | 113 of 290 (39%) |
| Labelled wholesaler or distributor | 44 of 95 (46%) |
| Labelled manufacturer | 8 of 95 (8%) |

No pass mark was set for how often a price is found.

The grader rejected 16 prices:

| Cause | Prices | Fixable by |
|---|---|---|
| Another product's price, for example CR123A batteries on a Duracell AA search | 6 | Stricter price matching |
| Placeholder or undefined figure | 3 | Stricter price matching |
| Not a price you can buy at: RRP, comparison site, one used listing | 3 | Using the supplier type and price wording |
| Lowest bulk tier shown as the price | 1 | Recording price tiers |
| Figure right, but basis or currency wrong | 3 | Stricter price matching |

Reading pages better won't produce factory prices. Those need quote requests or marketplace data.

## Serper and Brave

| Confirmed by the grader | Serper | Brave | Both found | Total using both |
|---|---|---|---|---|
| Manufacturers | 41 | 48 | 10 | 79 |
| Wholesalers and distributors | 45 | 43 | 11 | 77 |
| Non-retail prices | 34 | 33 | 9 | 58 |

The two find mostly different suppliers at similar quality, and Brave is slightly ahead on manufacturers. These counts are limited by the cap of 10 readable pages per provider, so reading more pages from one provider might close some of the gap. That hasn't been tested. Brave's terms also limit storing its data, which needs checking before it goes into the app.

## Sonnet and Haiku

Compared with Sonnet's answers on rows the grader confirmed, Haiku matched:

| Field | Same as Sonnet |
|---|---|
| Country | 234 of 246 (95%) |
| Supplier type | 255 of 303 (84%) |
| **Price** | **48 of 93 (52%)** |

Haiku costs about a twentieth as much per search but isn't good enough for prices. It could suit a first pass on type and country, with Sonnet reading prices. That split hasn't been tested.

## Cost

| Item | Spent |
|---|---|
| Sonnet: 2-product test and 20-product run, including about $0.07 of diagnosis | $5.12 |
| Haiku comparison | $0.25 |
| Opus grading, including the 10-row trial | $6.70 |
| **Total Anthropic spend** | **$12.07** |

**This went $0.07 over the $12 cap.** The cap stops new calls, but calls already in progress still finish. It also stopped grading 14 rows short, all from one generic product (shopping bags). Coverage rules were still met.

Serper and Brave search charges are billed separately and aren't included. In normal use, one product search costs about $0.28 with both providers and Sonnet, or about $0.12 with Serper alone, using third-party search prices.

## Limits of this test

- 20 products is a small sample, and the price mark rests on about 50 rows per provider. The 85–86% result is only 2 or 3 rows from 90%.
- 98 different pages failed to load, mostly with 429 or 403, even after a slower retry. Those suppliers have no details.
- 72 rows are marketplace pages that weren't opened, including manufacturer results on Alibaba and similar sites (24 from Serper, 19 from Brave).
- Pages are read as plain text, so prices loaded by a browser script are missed.

## Options

1. **Fix price matching, then re-test prices only.** Needs new budget, since the $12 is used. Recommended before building, because prices are Akin's priority.
2. **Build now and show prices as "check on page".** Supplier finding passes, and Akin sees it on Wholesale Scout sooner, but some shown prices will be wrong.
3. **Have Akin spot-check about 30 rows first,** to see how far the AI grader can be trusted. Takes about 15 minutes and can go with either option.

Whichever is chosen, the real tool needs email and phone details and quote requests, because most factories only give prices on request.

Build step 3 needs a new plan and Akin's approval.
