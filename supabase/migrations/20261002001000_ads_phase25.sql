-- Ads, phase 2.5: rollback (what each export replaced, revert and restore batches, snapshots),
-- organic rank checks, and launch plans.

-- Batches: proposals (approved changes), revert (undoing a batch), restore (back to a snapshot),
-- launch (the launcher's campaigns). `before` holds the values the batch's updates replace.
alter table ads_export_batches add column if not exists kind text not null default 'proposals';
alter table ads_export_batches drop constraint if exists ads_export_batches_kind_check;
alter table ads_export_batches add constraint ads_export_batches_kind_check check (kind in ('proposals', 'revert', 'restore', 'launch'));
alter table ads_export_batches add column if not exists reverts uuid references ads_export_batches(id) on delete set null;
alter table ads_export_batches add column if not exists before jsonb not null default '[]';
alter table ads_export_batches add column if not exists notes jsonb not null default '[]';

-- Each exported proposal's own replaced values (the stock guard restores from them).
alter table ads_proposals add column if not exists before jsonb;

-- Full copies of the account's bids, states, budgets and placements; the last 20 are kept.
create table if not exists ads_snapshots (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  state jsonb not null,
  counts jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Organic position per product and keyword, from the extension's manual rank checks.
create table if not exists ads_rank_checks (
  id uuid primary key default gen_random_uuid(),
  asin text not null,
  keyword text not null,
  -- 1–48 among organic results; null = not in the top 48.
  position integer check (position between 1 and 48),
  page integer,
  run_id uuid,
  checked_at timestamptz not null default now()
);
create index if not exists ads_rank_checks_key on ads_rank_checks (asin, keyword, checked_at desc);

-- Keywords tracked for rank besides the product's exact keywords.
create table if not exists ads_rank_keywords (
  asin text not null,
  keyword text not null,
  added_at timestamptz not null default now(),
  primary key (asin, keyword)
);

create table if not exists ads_launch_plans (
  asin text primary key,
  start_date date not null,
  input jsonb not null,
  campaigns jsonb not null,
  plan jsonb not null,
  batch_id uuid references ads_export_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table ads_snapshots enable row level security;
alter table ads_rank_checks enable row level security;
alter table ads_rank_keywords enable row level security;
alter table ads_launch_plans enable row level security;
revoke all on table ads_snapshots, ads_rank_checks, ads_rank_keywords, ads_launch_plans from anon, authenticated;
