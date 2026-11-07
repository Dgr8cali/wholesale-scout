-- Find suppliers: one row per search, its supplier rows kept as JSON. Additive only.
create table if not exists supplier_searches (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  kind text not null check (kind in ('wholesale', 'manufacturer')),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  error text,
  results jsonb not null default '[]'::jsonb,
  stats jsonb,
  warnings jsonb not null default '[]'::jsonb,
  -- AI and web search together, in US dollars.
  cost_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists supplier_searches_created_at on supplier_searches (created_at desc);
alter table supplier_searches enable row level security;
revoke all on supplier_searches from anon, authenticated;
