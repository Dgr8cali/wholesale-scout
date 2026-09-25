-- Brand map: each product's latest result re-gated on the current default profile (stored
-- data only), kept here so the Brands page and Home can aggregate by brand instantly. Rebuilt
-- in the background when a result changes or the default profile is saved. Safe to re-run.

create table if not exists brand_products (
  product_id         uuid primary key references products(id) on delete cascade,
  brand_key          text not null,
  brand              text not null,
  ean                text not null,
  asin               text,
  title              text,
  image_url          text,
  result_id          uuid,
  result_updated_at  timestamptz,
  -- Which default profile (id and save time) the verdict is on.
  profile_version    text not null,
  verdict            text,
  priced             boolean not null default false,
  sell_price         numeric(10,2),
  buy_box            numeric(10,2),
  fba_sellers        integer,
  -- Amazon sells or sold it (current offers, or within the Keepa history); null when unknown.
  amazon             boolean,
  max_landed         numeric(10,2),
  restriction        text,              -- open / approval_required / blocked / unknown
  apply_url          text,
  -- [{ "id", "name", "sharePct" }]: top Buy Box sellers; and who holds it now.
  sellers            jsonb not null default '[]'::jsonb,
  buy_box_holder     text,
  suppliers          text[] not null default '{}',
  evaluated_at       timestamptz not null default now()
);
create index if not exists brand_products_brand_idx on brand_products (brand_key);

create table if not exists brand_map_state (
  id              integer primary key default 1 check (id = 1),
  profile_version text,
  -- Results changed after this are re-evaluated on the next refresh.
  refreshed_at    timestamptz,
  lease_until     timestamptz,
  remaining       integer not null default 0
);
insert into brand_map_state (id) values (1) on conflict (id) do nothing;

alter table brand_products enable row level security;
alter table brand_map_state enable row level security;
