-- Keepa snapshot extras, and a cache of Keepa seller profiles.
alter table keepa_snapshots
  add column if not exists monthly_sold          integer,   -- Amazon's "bought in past month", via Keepa
  add column if not exists keepa_rank_drops_30d  integer,   -- Keepa's own 30-day rank-drop count
  add column if not exists package               jsonb,     -- {"l","w","h"} cm and "weight_g"
  add column if not exists fba_fee               numeric(8,2),  -- Keepa's FBA pick-and-pack estimate, GBP ex-VAT
  add column if not exists referral_fee_pct      numeric(5,2),
  add column if not exists variation_count       integer,
  add column if not exists buybox_seller_history jsonb;     -- [[unix ms, seller id], ...], last 365 days

-- Seller profiles for the top Buy Box sellers of rows that pass every gate. 1 Keepa token
-- each; reused for 7 days, since the same sellers recur across a brand's listings.
create table if not exists keepa_sellers (
  seller_id       text primary key,
  name            text,
  rating_pct      integer,        -- positive rating, last 12 months
  rating_count    integer,
  storefront_size integer,        -- listings on the storefront
  brands          jsonb not null default '[]'::jsonb,  -- [{"brand","count"}], largest first
  fetched_at      timestamptz not null default now()
);

alter table keepa_sellers enable row level security;
