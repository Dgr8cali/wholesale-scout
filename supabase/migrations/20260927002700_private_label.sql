-- Private label (Gatekeeper): candidates, their competitor ASINs with a Keepa snapshot, one row
-- per Gatekeeper field (with where it came from), Opportunity Explorer captures, and thresholds.

create table if not exists pl_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche_keyword text,
  category text not null default 'Everything else',
  status text not null default 'draft' check (status in ('draft', 'researching', 'samples', 'dropped', 'launched')),
  notes text,
  -- Keepa spend on this candidate's refreshes: the total and per UK day (the dashboard counts it).
  token_cost integer not null default 0,
  keepa_by_day jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pl_candidate_asins (
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  asin text not null,
  position smallint not null check (position between 1 and 10),
  is_reference boolean not null default false,
  title text,
  brand text,
  image text,
  price numeric,
  rating numeric,
  review_count integer,
  rank integer,
  avg_rank_90d integer,
  rank_drops_90d integer,
  bought_past_month integer,
  offer_count integer,
  buybox_price numeric,
  amazon_ever_seller boolean,
  amazon_brand boolean,
  dimensions jsonb,
  weight integer,
  first_seen timestamptz,
  -- Derived history figures (rank trend, offer trend, Buy Box trend) the fill reads.
  history jsonb,
  snapshot_at timestamptz,
  primary key (candidate_id, asin)
);
create index if not exists pl_candidate_asins_asin on pl_candidate_asins (asin, snapshot_at desc);

create table if not exists pl_candidate_fields (
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  key text not null,
  value text,
  source text not null check (source in ('keepa', 'poe', 'manual', 'fees')),
  updated_at timestamptz not null default now(),
  primary key (candidate_id, key)
);

create table if not exists pl_poe_snapshots (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references pl_candidates(id) on delete set null,
  niche_id text,
  niche_title text,
  captured_at timestamptz not null default now(),
  raw jsonb not null,
  search_volume_360 numeric,
  search_volume_growth numeric,
  products_in_niche integer,
  top3_click_share numeric,
  search_conversion numeric,
  avg_units_per_product numeric,
  search_terms jsonb not null default '[]'::jsonb
);
create index if not exists pl_poe_snapshots_candidate on pl_poe_snapshots (candidate_id, captured_at desc);

create table if not exists pl_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
insert into pl_settings (key, value) values
  ('budget', 1000), ('vat', 20), ('dst', 2), ('inbound', 0.30), ('prep', 0.15), ('storageMonths', 2),
  ('q4', 0), ('returnsPct', 2), ('minMultiple', 3.5), ('minLaunchMargin', 20), ('minSteadyMargin', 30), ('minProfit', 6)
on conflict (key) do nothing;

-- Same policy as every other table: RLS on, no policies, nothing granted to the public roles.
-- Only the service-role key (the app's server) reads or writes.
alter table pl_candidates enable row level security;
alter table pl_candidate_asins enable row level security;
alter table pl_candidate_fields enable row level security;
alter table pl_poe_snapshots enable row level security;
alter table pl_settings enable row level security;
revoke all on table pl_candidates, pl_candidate_asins, pl_candidate_fields, pl_poe_snapshots, pl_settings from anon, authenticated;
