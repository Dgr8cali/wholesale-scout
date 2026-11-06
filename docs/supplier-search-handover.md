# Handover: Supplier Search for Wholesale Scout (6 Nov 2026)

**Goal, in Akin's words:** "the actual feature where i search for a product and it gives me lots of supplier options both manufacturer, wholesale etc."

The reference product is [gsai.uk](https://www.gsai.uk). Study how it behaves, then use our own design and wording. Do not clone it.

**Why this file exists:** the study was done in a KaliStudio session by mistake. The feature belongs here. A reader needs nothing from that chat.

## Status

| Item | State | Evidence |
|---|---|---|
| GSAi study | Done | 4 searches and the public pages, 6 Nov, through a logged-in browser. Free plan, so half of each answer was locked |
| Repo review | Partial | Read `docs/STATUS.md` (sections below), the Qogita client, the `askModel` signature, the lead schema. Did not read the screening or run pipeline |
| Design | Proposal only | Nothing agreed with Akin |
| Code | Not started | No code, migration or env change. This file is untracked and uncommitted |
| Supplier data costs | Estimates | See Cost. Nothing was run or measured |

## What already exists here

The search should extend these. Do not rebuild them.

| Need | Already in the repo | Gap |
|---|---|---|
| Supplier record | `suppliers` table, with `kind` (`manufacturer`, `wholesaler`, `marketplace`, `retailer`), VAT basis, MOV. `/suppliers` page | `suppliers.website` and `suppliers.contact` exist (checked 6 Nov). No country field yet |
| Partner catalogue | `src/lib/qogita/client.ts`, nightly pull into `offers`, `GET /api/qogita/find` | The client filters by GTIN, brand or category only, with no free text. Search the local `offers` data, or confirm whether Qogita's API takes text |
| Manufacturers (Alibaba) | Supplier Scout: extension `alibaba-parse.js`, `POST /api/pl/suppliers/capture`, `pl_supplier_leads`, scoring, RFQ, quotes | Leads belong to a private-label candidate, and capture is per click from a page Akin opens |
| AI calls | `askModel` in `src/lib/server/adsAi.ts`: schema-bound answers, caching, retries, cost log in `ads_ai_calls` | Add a feature value to `AiFeature` |
| Long jobs | Background runs and hunts, restarted by the watchdog | Check that a live search fits this before choosing a streaming design |
| Is it worth buying? | Screening with Keepa and SP-API, fees, verdicts | Connect results to it. **Keepa tokens are scarce (about 21 a minute): never spend them automatically on every search result** |
| Navigation | `src/lib/workspaces.ts`, `New run` tabs in `src/components/newrun/` | New page or tab needs a Help article (a test enforces it) |

**The edge over GSAi:** GSAi stops at "here is a supplier". We can answer "is it profitable on Amazon for me, and can I sell it?" using the screening already here.

## How GSAi behaves

### Seen in the product

| Search | Result | Time |
|---|---|---|
| Colgate toothpaste | 8 suppliers (Qogita, EFG Housewares, 121 Wholesale). Good fit | about 24s |
| Insulated bottles, "manufacturer or factory rather than a wholesaler" | 8 suppliers. Unlocked results included a retail brand's homepage, a Fire Brigades Union shop and a wholesaler. **No factory seen** | about 20s, then a follow-up question |
| Bin bags by the case | 10 suppliers, a good wholesale mix | not timed |
| "Something cheap for my shop" | No search. One question back | a few seconds |

- **In progress:** a one-line plan, then status text ("Asking the search engines…", "Opening supplier pages…"). Results arrive live and reorder. A running supplier count updates.
- **Result card:** image, product, per-unit price, MOQ if known, VAT status, supplier, "Verified partner" badge, Save.
- **Detail view:** adds availability, a `Seller: Wholesaler` label on two web results, a short reason, pack maths ("Pack of 12 at £9.99 a pack"), and a warning such as "Price seen on a page listing many products". Links to the supplier's page.
- **All suppliers view:** a list of every supplier found, with price and MOQ.
- **Answer text:** one recommendation paragraph ("strongest lead") and an offer to share contact details.
- **Ranking:** "Ordered for an Amazon FBA business, best fit first". The seller type is a menu: Amazon FBA, TikTok Shop, eBay, Own website / Shopify, Wholesaler / reseller.
- **Refining:** chips ("Heavy-duty", "Biodegradable"). No filters seen.
- **Plans:** Free shows half the suppliers. Essential £20 and Pro £25 a month (less if paid yearly).

### Weak spots to beat

- No manufacturer filter or label seen, and the factory search failed.
- Retail pages pass as suppliers.
- Likely price errors: "COLGATE … PK12 from £10.40 per unit" looks like a pack price.
- Irrelevant results pass the check: "Hotel Amenities" under toothpaste, a category page as a product.
- Links can go to a collection page, not the product.

### Its stated pipeline (from its how-it-works page and FAQ, not verified)

1. Understand the product, quantity and where you sell. Ask one question if unclear. Never guess at an unknown barcode.
2. Turn the request into trade-search queries, with words to want and avoid.
3. Search partner catalogues first (it claims 500+ suppliers and names Qogita), carrying on if one is slow.
4. Search the web and open the best supplier pages.
5. Read the written price and work out the unit price. No price means "price on request", never an estimate.
6. Remove wrong products and dead links. If nothing survives, retry with a shorter term.
7. Rank for how you sell. Reuse web results for up to 24 hours.

**Inference only:** its back end was not visible. "Lumen", "Vantis" and "Orion" look like search depth and model choice under plan names. "Explore" could not be opened.

## Proposed design (not agreed)

```text
Query -> understand (askModel, may ask one question)
      -> sources: Qogita offers | suppliers already known | web search API
      -> read top pages -> extract fields (askModel, schema only, no tools)
      -> check: right product? supplier type? price basis?
      -> dedupe by supplier domain -> rank -> show
      -> actions: add to Suppliers | save lead | screen this product
```

- **Page:** a "Find suppliers" page in the Wholesale group, using `DataTable`, `PageHeader` and existing status chips. It follows the Calm Workbench look.
- **Filters:** supplier type, country, MOQ, price, has price, VAT basis.
- **Supplier type:** classify as manufacturer, wholesaler, distributor, marketplace or retailer. Show the evidence and a confidence level. Hide retailers by default. Note `suppliers.kind` has no `distributor` value, so decide whether to add one.
- **Honest data:** show pack price and unit price separately, with the source link and read time. Never estimate a missing price.
- **Tables:** probably `supplier_searches` and `supplier_search_results`, keeping raw extracted fields and page URLs. RLS on, access revoked from `anon` and `authenticated`.
- **Caching:** reuse page reads for 24 hours.

### Where manufacturer data comes from

| Source | Use | Caution |
|---|---|---|
| Web search (terms such as "factory", "OEM") | Start here | Quality unproven. GSAi's weak result suggests this is hard |
| Alibaba via Supplier Scout | Existing, per click, from Akin's own browser | Generalise leads so they do not need a candidate. Markup changes break it |
| Alibaba Open Platform | Automated search | Needs a reviewed application. Read its current docs first. Sources so far are third party |
| Third-party Alibaba scrapers (Apify, GitHub) | Avoid | Not authorised by Alibaba |
| Made-in-China, Global Sources | Unknown | Search found nothing on API access. Check their terms |

### Security requirements

The server will fetch URLs chosen by a search engine, then pass page text to a model. Treat both as hostile.

- **SSRF:** allow only http and https on normal ports. Block private, loopback and link-local addresses, including after redirects and DNS resolution. Cap size and time. This server also hosts Supabase and KaliStudio.
- **Prompt injection:** page text is data. Extraction calls have no tools and a strict schema, and page text can never trigger actions.
- **Output:** treat extracted links and text as untrusted when rendered. Allow only http and https links.
- **Politeness:** respect robots.txt and site terms, and rate limit per domain. Do not bypass logins or trade-account walls.

## Cost (estimates, not measured)

| Item | Per search | Basis |
|---|---|---|
| Search API, 5 queries | about $0.005 | Serper about $1 per 1,000 at entry level (secondary source) |
| Reading 20 pages | $0 to about $0.014 | Own fetch is free. Firecrawl Growth is $333/month for 500,000 pages, about $0.0007 each. Its JSON extraction adds 4 credits a page, so extract with our own model |
| Model | about $0.02 to $0.10 | Rough. For scale, Ask Scout cost £0.007 to £0.044 a question (STATUS, 20 Oct) |
| **Total** | **about $0.03 to $0.12** | Measure on the test set before trusting this |

Hosting adds nothing new, since it runs on the existing server and database. Check prices on vendor pages before signing up. STATUS also notes the app's AI price table may overstate Sonnet 5.5, so fix that before quoting real costs.

## Build order

1. **Test set first:** 20 real products, mixed branded, generic and manufacturer-seeking. Akin grades correct product, correct supplier type, correct price basis. Save GSAi's results for the same 20 only if he wants a comparison.
2. **Spike, no UI:** a script that runs the web path on the test set and prints graded results and actual cost. **Stop if manufacturer precision is poor** and rethink sources before building UI.
3. **Search and tables:** migration, fetch guard, extraction with recorded fixtures, cost logging.
4. **Page:** results, filters, supplier type, screenshots for Akin's OK.
5. **Connect:** Qogita offers, add to Suppliers, Supplier Scout leads, screening on click.

Tests use recorded pages and mocked clients. Do not call a paid service in `npm test`.

## Decisions

| Decision | State |
|---|---|
| Lives in Wholesale Scout | **Decided by Akin, 6 Nov.** Correction: the study recommended a separate repo because it assumed KaliStudio. That no longer applies |
| Own design and wording, not a clone | Promised to Akin |
| No unauthorised Alibaba scrapers | **Confirmed by Akin, 6 Nov** |

### Answered by Akin, 6 Nov

1. **Own sourcing only.**
2. **Regions first:** UK and EU wholesalers plus Chinese manufacturers.
3. **Search API:** compare Serper and Brave on the same products. Env names `SERPER_API_KEY` and `BRAVE_SEARCH_API_KEY` are in `.env.example`; add them to `infra/env.server.example` when the server first needs them (build step 3).
4. **Added requirement:** tell suppliers apart by country (UK, Germany, China and so on). Each result carries the country where the business is based, with evidence quoted from the page, or "Unknown".
5. **No Alibaba scraping confirmed:** the search doesn't open Alibaba or similar platform pages.

The plan for build steps 1 and 2 is `docs/superpowers/plans/2026-11-06-supplier-search-spike.md`.

## Repo rules that will catch you out

- Read `docs/STATUS.md` and `AGENTS.md` first. This is Next.js 16: `proxy.ts`, not middleware, and route params are a Promise.
- **Conflict:** `CLAUDE.md` and the saved memory say `make migrate`, while STATUS's conventions say `npm run migrate`. Use `make migrate`, because the other does not reach the server's database.
- After every commit: `git push origin main`, then `make deploy`, and report the hash and "==> up".
- Never push with failing `npm test`, `npm run lint` or `npm run build`. After UI changes also run `npm run test:a11y`.
- Update `docs/STATUS.md` in every commit that changes a feature.
- Selects return at most 1,000 rows. Use `selectAll` or `allRows`.
- Do not touch `scripts/.b.mjs`. Never print secrets.
- Keepa: estimate token spend first and report it after.
- **Check with Akin first:** new accounts or spending, deploys of visual changes (KaliStudio's habit is screenshots then an OK, so confirm he wants the same here).

## Evidence

Local only, gitignored, in `docs/ui-audit/gsai-study/`:

- Screenshots: `colgate-*`, `bottles-*`, `binbags-*`, `vague-*`, `card-qogita.png`, `card-web.png`, `suppliers.png`, `selling-as.png`, `how.png`, `pricing.png`, `faq.png`. They may show Akin's account email, so do not commit or share them. `explore.png` shows only the home page.
- Result text: `colgate.txt`, `bottles.txt`, `binbags.txt`, `vague.txt`. Some are snapshots taken while the answer text was still appearing.

Each GSAi conversation is also in Akin's account history.

## Unverified

- Everything about GSAi's back end.
- Whether web search can find real manufacturers at useful quality. **This is the main project risk.**
- Qogita's terms on showing its data, and any text search in its API.
- Costs, and third-party pricing, which came from secondary sources except Firecrawl's plan.
- The study saw only unlocked results, so GSAi's paid tiers may do better on manufacturers.

## Next action

```bash
cd ~/wholesale-scout && git fetch && git status -sb && git log --oneline -3 origin/main
```

Then read this file and `docs/STATUS.md`, and follow the plan named under Decisions.

## Sources

- [Qogita Developer Hub](https://help.qogita.com/developer-hub), [Qogita API docs](https://qogita.notion.site/Qogita-API-d2e0a30921d646b19b9468aebe2a03dc)
- [Alibaba Open Platform write-up (third party)](https://www.itechguides.com/?p=863931)
- [Web search API costs](https://apicostcalc.com/web-search-api-cost-calculator.html), [cheapest search APIs 2026](https://dev.to/team_metabees_4b5127db951/7-cheapest-web-search-apis-for-ai-agents-in-2026-ranked-76m)
- [Firecrawl pricing](https://www.firecrawl.dev/pricing)
