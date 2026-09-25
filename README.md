# Wholesale Scout

Amazon UK wholesale research: supplier price lists in, a screened and scored shortlist out.
Phase 1 of the build plan: upload with a remembered column mapper, the twelve screening gates,
the six-group win score, the July 2026 UK fee engine, SP-API fees and gating, and every
threshold editable in Settings.

Stack: Next.js 16 (app router), TypeScript, Tailwind 4, Supabase Postgres, Vercel.

## Setup

1. **Database.** Run `supabase/migrations/20260925000000_init.sql` in the Supabase SQL editor
   (or `supabase db push` with the CLI linked to the project). The app seeds the three default
   profiles, the compliance rules and the rate card on first use.
2. **Environment variables** (Vercel → Settings → Environment Variables):

   | Variable | Needed for |
   | --- | --- |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Everything. The anon key isn't used: RLS is on with no policies, so only the service key (server-side) can read or write. |
   | `APP_PASSWORD` | Opening the app. Production returns 503 without it, because the app can call your seller account. The browser asks once; any username. |
   | `SPAPI_CLIENT_ID`, `SPAPI_CLIENT_SECRET`, `SPAPI_REFRESH_TOKEN` | Catalog match by EAN, current Buy Box, Amazon's fee estimate. |
   | `SPAPI_MARKETPLACE_ID` | Defaults to `A1F83G8C2ARO7P` (UK). |
   | `SPAPI_SELLER_ID` | Gating checks (`getListingsRestrictions`). Your merchant token, from Seller Central → Settings → Account Info → Merchant Token. |
   | `KEEPA_API_KEY` | History-based gates. Anything that isn't a 64-character key keeps the stub; `KEEPA_MODE=stub` forces it. |

3. **Local development.** `vercel env pull .env.local` brings down the Development variables;
   the current ones are set for Production and Preview only, so add them to Development too (or
   use a separate Supabase project for local work). Then `npm run dev`.

## Commands

```
npm run dev        # local app
npm test           # unit + pipeline tests (Vitest)
npm run typecheck
npm run lint
npm run build
```

## How a run works

1. **Upload** (`/upload`). xlsx/csv is parsed in the browser. The header row is detected and the
   layout fingerprinted; a known layout maps itself, a new one gets the mapping screen. VAT basis,
   VAT rate and currency are saved on the supplier. Non-GBP prices convert at ingest using ECB
   rates (editable), and every offer stores its rate and date. Costs are stored per unit, GBP, ex-VAT.
2. **Ingest** stores suppliers, mappings, products (one per EAN–ASIN pair) and offers, then opens a
   run with one row per product, using the cheapest landed offer across all uploaded files.
3. **Process** (the results page drives it, 20 rows per call):
   - row gates first (compliance, budget fit): no API call is spent on a row that fails them;
   - SP-API catalog lookup by EAN and Keepa history (cached 24 h). An EAN with several ASINs keeps
     them all as separate rows;
   - the market gates, then gating and Amazon's own fee estimate only for rows still standing;
   - fees from `getMyFeesEstimate` when available, else the rate card; profit, ROI, margin, hurdle
     price, win score, band and the why line.
4. **Results** (`/runs/[id]`): verdict, score, landed cost, sell price, profit, ROI, margin, hurdle
   and why; sort by any column, filter by verdict, band, the gate that failed, or text; expand a row
   for each gate's outcome, the fee breakdown and the group scores; export the filtered view to xlsx.

While Keepa is a stub, the history gates (borrowed rank, Amazon presence, price regime, price drift)
report "not checked" rather than failing. Demand and price come from SP-API's current rank and Buy
Box, and no row goes green on that snapshot alone: it's held at amber until there's history.

## Where things live

| Path | What |
| --- | --- |
| `src/lib/fees/` | Rate card (data) and fee engine: tiers, dimensional weight, low-price FBA, referral bands, DSF, VAT, storage, landed cost, hurdle price |
| `src/lib/screening/` | Profile config and defaults, compliance rules, the twelve gates, the win score |
| `src/lib/spapi/` | LWA auth and the SP-API calls, with response parsers |
| `src/lib/keepa/` | Keepa interface, stub, HTTP client and history summary |
| `src/lib/ingest/` | Header detection, fingerprint, mapping, money and EAN parsing |
| `src/lib/server/` | Supabase access, seeding, ingest and the run processor |
| `supabase/migrations/` | Schema |

## Known limits

- The Keepa HTTP client follows Keepa's documented format but hasn't been run against a live key.
  Try it on a short list first and compare a few rows with Keepa Pro.
- SP-API calls are tested against recorded response shapes, not live. The fee parser treats each
  fee's `FinalFee` less `TaxAmount` as ex-VAT, then adds DSF and VAT the same way as the rate card.
- The rate card is Gatekeeper's July 2026 table. Peak surcharges beyond the small parcel and
  oversize per-kg rounding follow Gatekeeper and should be checked against the PDF.
- Not in Phase 1: ASIN paste entry, Qogita pull, watchlist and alerts, the supplier ledger UI, and
  Supabase Auth (the password gate stands in for it).
