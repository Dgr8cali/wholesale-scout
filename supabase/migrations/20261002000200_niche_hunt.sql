-- Niche Hunt (Private label): Product Finder hunts grouped into niches, the hunted ASINs' Keepa
-- snapshots (reused for 7 days, and by "Create candidate"), named filter presets, and niches you
-- dismissed so repeat hunts don't show them again.

create table if not exists pl_hunts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null,
  asins text[] not null default '{}',
  finder_total integer,
  fetched integer not null default 0,
  reused integer not null default 0,
  -- Keepa spend: the finder page and the detail fetch, the total and per UK day (the dashboard counts it).
  finder_tokens integer not null default 0,
  detail_tokens integer not null default 0,
  token_cost integer not null default 0,
  keepa_by_day jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pl_hunt_asins (
  asin text primary key,
  title text,
  brand text,
  image text,
  root_category text,
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
  amazon_last_seen_days integer,
  amazon_brand boolean,
  dimensions jsonb,
  weight integer,
  first_seen timestamptz,
  history jsonb,
  snapshot_at timestamptz not null
);

create table if not exists pl_hunt_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  filters jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pl_niche_dismissals (
  key text primary key,
  name text,
  reason text,
  created_at timestamptz not null default now()
);

alter table pl_hunts enable row level security;
alter table pl_hunt_asins enable row level security;
alter table pl_hunt_presets enable row level security;
alter table pl_niche_dismissals enable row level security;
revoke all on table pl_hunts, pl_hunt_asins, pl_hunt_presets, pl_niche_dismissals from anon, authenticated;
