-- Niche Hunt in two stages, per leaf category, as a background job: size each leaf with one
-- Product Finder call (no detail), then fetch detail for the most promising leaves. Each leaf is a
-- niche.

-- A hunt is a job: its leaves (sized, then detailed), progress, and a lease like screening runs.
alter table pl_hunts add column if not exists status text not null default 'done'
  check (status in ('listing', 'sizing', 'detailing', 'done', 'error', 'cancelled'));
alter table pl_hunts add column if not exists leaves jsonb;
alter table pl_hunts add column if not exists progress jsonb not null default '{}'::jsonb;
alter table pl_hunts add column if not exists note text;
alter table pl_hunts add column if not exists lease_until timestamptz;
alter table pl_hunts add column if not exists last_progress_at timestamptz;
alter table pl_hunts add column if not exists finished_at timestamptz;

-- Amazon UK's category tree below the roots hunted, from Keepa (refreshed weekly).
create table if not exists pl_category_tree (
  id bigint primary key,
  name text not null,
  parent bigint,
  root_id bigint not null,
  child_ids bigint[] not null default '{}',
  product_count bigint,
  fetched_at timestamptz not null default now()
);
create index if not exists pl_category_tree_root on pl_category_tree (root_id);

-- A leaf's Product Finder match count under a set of filters, with its best-selling ASINs (7 days).
create table if not exists pl_leaf_counts (
  leaf_id bigint not null,
  filters_key text not null,
  matches integer not null,
  asins text[] not null default '{}',
  finder_tokens integer not null default 0,
  counted_at timestamptz not null default now(),
  primary key (leaf_id, filters_key)
);

alter table pl_category_tree enable row level security;
alter table pl_leaf_counts enable row level security;
revoke all on table pl_category_tree, pl_leaf_counts from anon, authenticated;

-- Seed presets: Gate 0/1 defaults with the roots and leaf counts to start from.
insert into pl_hunt_presets (name, filters) values
  ('Home & Kitchen — first pass', '{"priceMin":18,"priceMax":35,"maxReviews":500,"ratingMin":3.8,"ratingMax":4.3,"minRankDrops90":300,"maxRank90":75000,"noAmazon":true,"maxWeightG":500,"smallParcel":true,"categories":[11052681],"minListedMonths":6,"excludeAmazonBrands":true,"minAsins":3,"leavesCap":60,"detailLeaves":15,"perLeaf":12,"minLeafMatches":5}'::jsonb),
  ('Garden + Pet + Sports', '{"priceMin":18,"priceMax":35,"maxReviews":500,"ratingMin":3.8,"ratingMax":4.3,"minRankDrops90":300,"maxRank90":75000,"noAmazon":true,"maxWeightG":500,"smallParcel":true,"categories":[11052671,340840031,318949011],"minListedMonths":6,"excludeAmazonBrands":true,"minAsins":3,"leavesCap":60,"detailLeaves":15,"perLeaf":12,"minLeafMatches":5}'::jsonb)
on conflict (name) do nothing;
