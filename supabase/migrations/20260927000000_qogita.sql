-- Qogita: saved pulls ("presets"), each pull's record, and where an offer came from.
-- Safe to run more than once.

-- A named set of Qogita filters, pulled on demand ("Run again") and nightly.
create table if not exists qogita_presets (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  -- { category: { name, path } | null, brands: [], minPrice, maxPrice, maxDeliveryWeeks, movLimit }
  filters         jsonb not null default '{}'::jsonb,
  profile_id      uuid references profiles(id) on delete set null,
  nightly         boolean not null default true,
  -- EAN -> price as last pulled, so the nightly re-pull screens only what's new or moved.
  last_prices     jsonb not null default '{}'::jsonb,
  last_pulled_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per pull: what was fetched, what was kept, and the run it made.
create table if not exists qogita_pulls (
  id           uuid primary key default gen_random_uuid(),
  preset_id    uuid references qogita_presets(id) on delete cascade,
  run_id       uuid references runs(id) on delete set null,
  kind         text not null default 'manual' check (kind in ('manual', 'nightly')),
  -- { fetched, kept, new, moved, unchanged, truncated, currency }
  stats        jsonb not null default '{}'::jsonb,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists qogita_pulls_preset_idx on qogita_pulls (preset_id, started_at desc);

-- Where an offer came from outside a sheet: for Qogita, the variant's product URL.
alter table offers add column if not exists external_ref text;

alter table qogita_presets enable row level security;
alter table qogita_pulls enable row level security;
