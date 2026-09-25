-- Hunt: Amazon UK's top-level categories from Keepa (for the Product Finder), kept so the
-- list costs 1 token once. Safe to re-run.
create table if not exists keepa_categories (
  id bigint primary key,
  name text not null,
  products integer,
  fetched_at timestamptz not null default now()
);
