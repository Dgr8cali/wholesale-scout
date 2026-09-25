-- Seller scans: a seller's storefront ASIN list (Keepa, 10 tokens, cached 7 days) and the
-- runs that screened it. Extends the seller-profile cache. Safe to re-run.

alter table keepa_sellers
  add column if not exists business_name              text,
  add column if not exists buy_box_ownership_pct      integer,     -- share of its listings' Buy Box it holds (new)
  add column if not exists asin_list                  jsonb,       -- storefront ASINs, most recently seen first
  add column if not exists asin_total                 integer,     -- ASINs Keepa listed for the storefront
  add column if not exists storefront_fetched_at      timestamptz,
  -- Tokens the last storefront lookup spent that no run has been charged with yet.
  add column if not exists storefront_unbilled_tokens integer not null default 0,
  add column if not exists last_scan_run_id           uuid references runs(id) on delete set null,
  add column if not exists last_scan_at               timestamptz;

create index if not exists keepa_sellers_scanned_idx on keepa_sellers (last_scan_at desc) where storefront_fetched_at is not null;
