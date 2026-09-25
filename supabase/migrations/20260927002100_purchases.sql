-- Tracker: what you bought, with the app's prediction frozen at that moment, to compare with
-- what actually happens. Safe to re-run.
create table if not exists purchases (
  id             uuid primary key default gen_random_uuid(),
  asin           text not null,
  ean            text,
  product_id     uuid references products(id) on delete set null,
  supplier_id    uuid references suppliers(id) on delete set null,
  supplier_name  text,
  units          integer not null check (units > 0),
  -- Per unit, GBP: the supplier's price ex-VAT, and landed (with VAT you can't reclaim, duty,
  -- inbound and prep).
  unit_cost_gbp  numeric,
  landed_gbp     numeric not null check (landed_gbp >= 0),
  ordered_on     date not null default current_date,
  -- ordered → received → sent (to Amazon) → live → closed (sold out or written off)
  status         text not null default 'ordered' check (status in ('ordered', 'received', 'sent', 'live', 'closed')),
  -- When each status was reached: { "received": "2026-10-02", ... }
  status_dates   jsonb not null default '{}',
  note           text,
  -- The prediction when you bought: sell price, fees, profit, sales, share, months to sell,
  -- score, verdict, confidence, profile and the result it came from.
  prediction     jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists purchases_asin on purchases (asin);
create index if not exists purchases_status on purchases (status);
alter table purchases enable row level security;
