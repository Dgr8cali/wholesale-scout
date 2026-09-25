-- Watchlist and alerts. A favourite is on the watchlist: with a flip condition chosen from what
-- blocked it (Buy Box ≥ £X, landed ≤ £X, brand approved, sellers ≤ N, Amazon gone 30+ days,
-- back in stock), or none ("re-check weekly"). A weekly job re-checks them; an item that flips to
-- pass or meets its condition raises an alert (emailed as one digest per job). Items marked
-- "no supplier" alert as soon as an upload or Qogita pull offers the EAN at or under the max
-- landed cost. Safe to re-run.

alter table favourites
  -- { "kind": "buyBox" | "landed" | "brandApproved" | "sellers" | "amazonGone" | "backInStock", "value"?: number }
  add column if not exists condition     jsonb,
  add column if not exists no_supplier   boolean not null default false,
  -- The last re-check: { at, verdict, met, detail, buyBox, maxLanded, landed, sellers, amazonDays, runId, resultId }
  add column if not exists last_check    jsonb,
  add column if not exists checked_at    timestamptz;

create table if not exists watch_alerts (
  id            uuid primary key default gen_random_uuid(),
  favourite_id  uuid references favourites(id) on delete cascade,
  ean           text not null,
  asin          text,
  title         text,
  -- passes: it now passes; condition: its flip condition holds; supplier: a new offer at or under max landed.
  kind          text not null check (kind in ('passes', 'condition', 'supplier')),
  detail        text not null,
  run_id        uuid references runs(id) on delete set null,
  created_at    timestamptz not null default now(),
  emailed_at    timestamptz,
  dismissed_at  timestamptz
);
create index if not exists watch_alerts_open_idx on watch_alerts (created_at desc) where dismissed_at is null;
alter table watch_alerts enable row level security;
