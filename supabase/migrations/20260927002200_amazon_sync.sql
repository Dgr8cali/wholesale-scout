-- Amazon's own figures for the tracker, synced nightly: sales per ASIN per day (orders report),
-- FBA stock (inventory API), and Amazon's fee estimate at the price you actually sold at.
-- Safe to re-run.
create table if not exists amazon_sales (
  asin      text not null,
  day       date not null,
  -- Amazon (FBA) or Merchant
  channel   text not null,
  units     integer not null default 0,
  orders    integer not null default 0,
  -- Item price less promotions, VAT included (as the customer paid), GBP.
  revenue   numeric not null default 0,
  primary key (asin, day, channel)
);
create index if not exists amazon_sales_day on amazon_sales (day);

create table if not exists amazon_inventory (
  sku          text primary key,
  asin         text not null,
  fulfillable  integer not null default 0,
  inbound      integer not null default 0,
  reserved     integer not null default 0,
  unsellable   integer not null default 0,
  total        integer not null default 0,
  updated_at   timestamptz not null default now()
);
create index if not exists amazon_inventory_asin on amazon_inventory (asin);

create table if not exists amazon_fee_estimates (
  asin        text primary key,
  price       numeric not null,
  referral    numeric,
  fba         numeric,
  total       numeric,
  fetched_at  timestamptz not null default now()
);

-- The sync's progress (one row): which step it's on, the report it's waiting for, when it
-- last finished, and its last error.
create table if not exists amazon_sync (
  id           integer primary key default 1 check (id = 1),
  state        jsonb not null default '{"stage": "idle"}',
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  updated_at   timestamptz not null default now()
);
insert into amazon_sync (id) values (1) on conflict (id) do nothing;

alter table amazon_sales enable row level security;
alter table amazon_inventory enable row level security;
alter table amazon_fee_estimates enable row level security;
alter table amazon_sync enable row level security;
