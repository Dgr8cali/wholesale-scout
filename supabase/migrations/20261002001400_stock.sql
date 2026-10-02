-- Stock: what you hold, by item and bucket (self-ship at home, Amazon FBA, TikTok FBT), as a
-- ledger of movements. FBA levels come from SP-API (amazon_inventory) and Amazon sales from the
-- orders sync (amazon_sales): never entered by hand.

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  asin text,
  barcode text,
  category text,
  status text not null default 'active' check (status in ('active', 'discontinued')),
  -- A variant's parent item (by SKU); null for a standalone item or a parent.
  parent_sku text,
  unit_cost numeric,
  packaging_cost numeric,
  -- Low-stock level: at or under it the item is "low".
  reorder_level integer,
  supplier_id uuid references suppliers(id) on delete set null,
  lead_time_days integer,
  image_url text,
  notes text,
  -- Where it came from (an import's own id), so re-importing updates instead of duplicating.
  source_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stock_items_asin on stock_items (asin);

create table if not exists stock_listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items(id) on delete cascade,
  marketplace text not null,
  marketplace_sku text,
  title text,
  url text,
  price numeric,
  fee_pct numeric,
  default_bucket text check (default_bucket in ('home', 'fba', 'tiktok_fbt')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  source_ref text unique,
  created_at timestamptz not null default now()
);

-- Sales outside Amazon (Amazon's come from the orders sync).
create table if not exists stock_sales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items(id) on delete cascade,
  listing_id uuid references stock_listings(id) on delete set null,
  channel text not null,
  order_id text,
  date date not null,
  quantity integer not null check (quantity > 0),
  price_each numeric not null,
  -- The cost at that moment: unit, packaging, the listing's fee, per unit.
  cost_snapshot jsonb not null default '{}',
  returned_quantity integer not null default 0,
  note text,
  source_ref text unique,
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stock_items(id) on delete cascade,
  bucket text not null check (bucket in ('home', 'fba', 'tiktok_fbt')),
  -- Signed: + into the bucket, − out of it.
  quantity integer not null check (quantity <> 0),
  kind text not null check (kind in ('receipt', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out')),
  date date not null,
  reason text,
  unit_cost numeric,
  sale_id uuid references stock_sales(id) on delete cascade,
  purchase_id uuid references purchases(id) on delete set null,
  note text,
  source_ref text unique,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item on stock_movements (item_id, date);

create table if not exists stock_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
insert into stock_settings (key, value) values ('lowStockDefault', 10), ('coverTargetDays', 30), ('leadBufferDays', 7) on conflict (key) do nothing;

-- Purchases of stock items: an item may have no ASIN (or one the catalogue doesn't hold), and no
-- screening to freeze as a prediction. Receiving one puts it in a bucket.
alter table purchases alter column asin drop not null;
alter table purchases alter column prediction set default '{}';
alter table purchases add column if not exists stock_item_id uuid references stock_items(id) on delete set null;
alter table purchases add column if not exists received_bucket text check (received_bucket in ('home', 'fba', 'tiktok_fbt'));

alter table stock_items enable row level security;
alter table stock_listings enable row level security;
alter table stock_sales enable row level security;
alter table stock_movements enable row level security;
alter table stock_settings enable row level security;
revoke all on table stock_items, stock_listings, stock_sales, stock_movements, stock_settings from anon, authenticated;
