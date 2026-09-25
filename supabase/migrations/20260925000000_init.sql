-- Wholesale Scout — initial schema.
-- The nine tables from the build plan's data model, plus the two small settings
-- tables it names (rate_cards, category_rules).
--
-- All access goes through Next.js route handlers using the service key, so RLS is
-- enabled on every table with no policies: the anon key can read or write nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- suppliers — the ledger. One row per supplier, applied to every line from them.
-- ---------------------------------------------------------------------------
create table if not exists suppliers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  source_type         text not null default 'upload'
                        check (source_type in ('upload', 'qogita', 'manual')),
  vat_basis           text not null default 'ex_vat'
                        check (vat_basis in ('ex_vat', 'inc_vat')),
  vat_rate            numeric(5,2) not null default 20,   -- % stripped from inc-VAT prices
  currency            char(3) not null default 'GBP',
  mov                 numeric(12,2),                      -- minimum order value, supplier currency
  delivery_days       integer,
  importer_of_record  text,
  labelling           text,
  invoice_notes       text,
  rating              smallint check (rating between 0 and 5),
  gate_outcomes       jsonb not null default '[]'::jsonb,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- supplier_mappings — learned column layouts, keyed by a fingerprint of the headers.
-- ---------------------------------------------------------------------------
create table if not exists supplier_mappings (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid not null references suppliers(id) on delete cascade,
  header_fingerprint  text not null,
  headers             jsonb not null default '[]'::jsonb,
  mapping             jsonb not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (supplier_id, header_fingerprint)
);
create index if not exists supplier_mappings_fingerprint_idx on supplier_mappings (header_fingerprint);

-- ---------------------------------------------------------------------------
-- products — one row per EAN–ASIN pair. asin is null until the EAN is matched.
-- ---------------------------------------------------------------------------
create table if not exists products (
  id                  uuid primary key default gen_random_uuid(),
  ean                 text not null,
  asin                text,
  title               text,
  brand               text,
  category            text,            -- Amazon category (from catalog / Keepa)
  referral_category   text,            -- rate-card referral category the fee engine uses
  dims_cm             jsonb,           -- {"l":..,"w":..,"h":..}
  weight_g            numeric(10,1),
  parent_asin         text,
  variation_count     integer,
  sales_rank          integer,
  compliance_flags    jsonb not null default '[]'::jsonb,
  catalog_updated_at  timestamptz,
  keepa_updated_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists products_ean_asin_key on products (ean, coalesce(asin, ''));
create index if not exists products_asin_idx on products (asin);

-- ---------------------------------------------------------------------------
-- keepa_snapshots — cached history per ASIN. Reused for 24 hours.
-- ---------------------------------------------------------------------------
create table if not exists keepa_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  asin                text not null,
  fetched_at          timestamptz not null default now(),
  rank_series         jsonb,
  buybox_series       jsonb,
  new_series          jsonb,
  offer_count_series  jsonb,
  amazon_series       jsonb,
  review_count_series jsonb,
  summary             jsonb not null default '{}'::jsonb
    -- rank_drops_30d, avg_rank_90d, median_12m, current_bb, offers_now, amazon_last_seen,
    -- history_days, top_seller_bb_share, fba_offers, bb_slope_pct_yr, review_jump_pct, ...
);
create index if not exists keepa_snapshots_asin_fetched_idx on keepa_snapshots (asin, fetched_at desc);

-- ---------------------------------------------------------------------------
-- offers — a supplier's price for a product. FX is applied at ingest and stored.
-- ---------------------------------------------------------------------------
create table if not exists offers (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  supplier_id         uuid not null references suppliers(id) on delete cascade,
  unit_cost           numeric(12,4) not null,   -- as on the sheet, per unit, supplier currency
  currency            char(3) not null default 'GBP',
  fx_rate             numeric(14,6) not null default 1,   -- GBP per 1 unit of currency
  fx_date             date,
  unit_cost_gbp       numeric(12,4) not null,   -- per unit, ex-VAT, GBP
  pack_units          integer not null default 1,
  moq                 integer,
  stock               integer,
  title               text,
  brand               text,
  category            text,                     -- supplier's own category text
  seen_at             timestamptz not null default now(),
  source_ref          text                      -- file name and row number
);
create index if not exists offers_product_idx on offers (product_id);
create index if not exists offers_supplier_idx on offers (supplier_id);

-- ---------------------------------------------------------------------------
-- profiles — gate modes and parameters, weights, scales, fee assumptions.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  config              jsonb not null,
  is_default          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists profiles_one_default on profiles (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- runs — one upload (or API pull) screened with one profile.
-- ---------------------------------------------------------------------------
create table if not exists runs (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid references profiles(id) on delete set null,
  profile_snapshot    jsonb,          -- the profile config as it was when the run started
  source              text not null,  -- e.g. file names
  status              text not null default 'pending'
                        check (status in ('pending', 'processing', 'done', 'failed')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  row_count           integer not null default 0,
  processed_count     integer not null default 0,
  token_cost          integer not null default 0,
  error               text
);

-- ---------------------------------------------------------------------------
-- results — one scored row per product per run.
-- ---------------------------------------------------------------------------
create table if not exists results (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references runs(id) on delete cascade,
  product_id          uuid not null references products(id) on delete cascade,
  offer_id            uuid references offers(id) on delete set null,
  offer_count         integer not null default 1,   -- supplier offers seen for this product in the run
  status              text not null default 'pending'
                        check (status in ('pending', 'done', 'error')),
  verdict             text check (verdict in ('pass', 'warn', 'fail')),
  failed_gate         text,
  gate_outcomes       jsonb not null default '[]'::jsonb,
  fees                jsonb,
  sell_price          numeric(12,2),
  price_source        text,
  landed_cost         numeric(12,4),
  profit              numeric(12,2),
  roi                 numeric(8,2),
  margin              numeric(8,2),
  hurdle_price        numeric(12,2),
  score               numeric(5,1),
  group_scores        jsonb,
  why                 text,
  band                text check (band in ('green', 'amber', 'grey')),
  error               text,
  updated_at          timestamptz not null default now(),
  unique (run_id, product_id)
);
create index if not exists results_run_idx on results (run_id, status);

-- ---------------------------------------------------------------------------
-- watchlist — near-misses and the condition that would flip them.
-- ---------------------------------------------------------------------------
create table if not exists watchlist (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  condition           jsonb not null,
  last_checked        timestamptz,
  status              text not null default 'watching'
                        check (status in ('watching', 'now_passes', 'dismissed')),
  alert_channel       text not null default 'email',
  created_at          timestamptz not null default now()
);
create index if not exists watchlist_product_idx on watchlist (product_id);

-- ---------------------------------------------------------------------------
-- rate_cards — versioned fee tables. The active one is used; the rest are history.
-- ---------------------------------------------------------------------------
create table if not exists rate_cards (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  effective_from      date not null,
  card                jsonb not null,
  is_active           boolean not null default false,
  created_at          timestamptz not null default now()
);
create unique index if not exists rate_cards_one_active on rate_cards (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- category_rules — compliance rule sets shared by every profile.
-- ---------------------------------------------------------------------------
create table if not exists category_rules (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique,
  name                text not null,
  keywords            text[] not null default '{}',
  amazon_categories   text[] not null default '{}',
  note                text,
  checklist           text[] not null default '{}',
  sort                integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security: on everywhere, no policies. Only the service key gets in.
-- ---------------------------------------------------------------------------
alter table suppliers          enable row level security;
alter table supplier_mappings  enable row level security;
alter table products           enable row level security;
alter table keepa_snapshots    enable row level security;
alter table offers             enable row level security;
alter table profiles           enable row level security;
alter table runs               enable row level security;
alter table results            enable row level security;
alter table watchlist          enable row level security;
alter table rate_cards         enable row level security;
alter table category_rules     enable row level security;
