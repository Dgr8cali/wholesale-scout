-- Ads phase 5: smoothed conversion, keyword whitelist/blacklist, per-rule lookback, TACoS mode,
-- listing health and the keyword bank.

-- Smoothing weight (clicks) for conversion, and the CTR benchmark (%) for listing health.
insert into ads_settings (key, value) values ('smoothingK', 20), ('ctrBenchmark', 0.4) on conflict (key) do nothing;

-- Each rule's own analysis window, in days (7, 14, 30 or 60); null = the rule's default.
alter table ads_rules add column if not exists lookback_days integer check (lookback_days in (7, 14, 30, 60));

-- Optimise a product for ACoS (default) or TACoS, with its target TACoS (%).
alter table ads_products add column if not exists optimise text not null default 'acos' check (optimise in ('acos', 'tacos'));
alter table ads_products add column if not exists target_tacos numeric;

-- Whitelist (never negatived or paused) and blacklist (always negative phrase in new campaigns):
-- one account-wide list each (scope 'account') and per product (scope = the ASIN), which adds to the
-- account's unless use_account is off.
create table if not exists ads_keyword_lists (
  scope text not null,
  kind text not null check (kind in ('whitelist', 'blacklist')),
  terms text[] not null default '{}',
  use_account boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (scope, kind)
);

-- The keyword bank's own entries (manual additions); the other sources are read where they live.
create table if not exists ads_keyword_bank (
  id uuid primary key default gen_random_uuid(),
  asin text not null,
  text text not null,
  -- Lower case, punctuation out, single spaces: one row per term however it was typed.
  norm text not null,
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  unique (asin, norm)
);

alter table ads_keyword_lists enable row level security;
alter table ads_keyword_bank enable row level security;
revoke all on ads_keyword_lists from anon, authenticated;
revoke all on ads_keyword_bank from anon, authenticated;
