-- Private label: Niche Import. Opportunity Explorer category downloads (CSV, one row per niche),
-- scored and flagged; no Keepa until an incumbent check is asked for.

create table if not exists pl_niche_imports (
  id uuid primary key default gen_random_uuid(),
  -- One user behind the password gate; kept for the shape every table might grow into.
  user_id text,
  category text not null,
  marketplace text not null default 'UK',
  filename text,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  -- Columns the parser couldn't map, and niches merged as duplicates.
  unmapped text[] not null default '{}',
  duplicates integer not null default 0
);
create index if not exists pl_niche_imports_category on pl_niche_imports (lower(category));

create table if not exists pl_niches (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references pl_niche_imports(id) on delete cascade,
  user_id text,
  customer_need text not null,
  search_terms text[] not null default '{}',
  top_clicked_products integer,
  sv_360 bigint,
  -- Growth as fractions (0.0321 = +3.21%).
  growth_180 numeric,
  sv_90 bigint,
  growth_90 numeric,
  -- The niche's units over 360 days, and the range of its average product's.
  units_360_min bigint,
  units_360_max bigint,
  units_per_product_min integer,
  units_per_product_max integer,
  units_per_product_mid integer,
  avg_price numeric,
  min_price numeric,
  max_price numeric,
  -- A fraction (0.03 = 3%).
  return_rate numeric,
  -- aliases (identical niches merged into this one), incumbents (the last check).
  extra jsonb not null default '{}',
  -- The row as exported, for anything the parser didn't map.
  raw_row jsonb,
  score numeric,
  score_breakdown jsonb,
  flags text[] not null default '{}',
  -- From an incumbent check: open, contested or dominated.
  shape text check (shape in ('open', 'contested', 'dominated')),
  status text not null default 'new' check (status in ('new', 'shortlisted', 'dismissed', 'candidate')),
  notes text,
  candidate_id uuid references pl_candidates(id) on delete set null,
  -- Keepa tokens its incumbent checks spent, per UK day (Private label's monthly total).
  keepa_by_day jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pl_niches_import on pl_niches (import_id);
create index if not exists pl_niches_need on pl_niches (lower(customer_need));

-- The niche scorer's editable lists (the BIG_BRAND terms).
create table if not exists pl_niche_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table pl_niche_imports enable row level security;
alter table pl_niches enable row level security;
alter table pl_niche_settings enable row level security;
revoke all on pl_niche_imports from anon, authenticated;
revoke all on pl_niches from anon, authenticated;
revoke all on pl_niche_settings from anon, authenticated;
