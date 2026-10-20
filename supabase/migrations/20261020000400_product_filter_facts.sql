-- Products' filters fast (UI redesign 5): what the results filters read of each product's latest
-- result (profit, ROI, sales / mo, BSR, gated…), kept per result so Products filters in one query
-- instead of reading every result's JSON. Filled by the app (src/lib/server/productFacts.ts, the
-- same toFilterRow() the tables use), refreshed whenever the result's updated_at moves on.
-- Additive only: nothing reads or writes results differently.
create table if not exists product_filter_facts (
  result_id uuid primary key references results(id) on delete cascade,
  result_updated_at timestamptz not null,
  is_error boolean not null default false,
  band text,
  failed_gate text,
  amazon text,
  approval text,
  waived boolean not null default false,
  dormant boolean not null default false,
  sales numeric,
  sellers numeric,
  profit numeric,
  roi numeric,
  margin numeric,
  sell numeric,
  bsr numeric
);
alter table product_filter_facts enable row level security;
revoke all on product_filter_facts from anon, authenticated;

create index if not exists product_filter_facts_profit on product_filter_facts (profit);
create index if not exists product_filter_facts_roi on product_filter_facts (roi);
create index if not exists product_filter_facts_sales on product_filter_facts (sales);
create index if not exists product_filter_facts_bsr on product_filter_facts (bsr);
create index if not exists product_filter_facts_approval on product_filter_facts (approval);

-- Products' order (newest screening first) and the join to each product's latest result.
create index if not exists brand_products_listed on brand_products (result_updated_at desc nulls last, product_id) where asin is not null;
create index if not exists brand_products_result on brand_products (result_id);

-- One row per product on the list (the newest per ASIN, as Products shows them), with its latest
-- result's facts and whether they're current (facts_fresh false: the app refreshes them first).
create or replace view product_list with (security_invoker = on) as
select * from (
  select bp.product_id, bp.asin, bp.ean, bp.title, bp.brand, bp.image_url, bp.verdict, bp.priced, bp.sell_price,
    bp.max_landed, bp.fba_sellers, bp.share_month, bp.result_updated_at, bp.result_id, bp.suppliers,
    row_number() over (partition by bp.asin order by bp.result_updated_at desc nulls last, bp.product_id) = 1 as newest,
    (f.result_id is not null and f.result_updated_at = r.updated_at) as facts_fresh,
    f.is_error, f.band, f.failed_gate, f.amazon, f.approval, f.waived, f.dormant,
    f.sales, f.sellers, f.profit, f.roi, f.margin, f.sell, f.bsr
  from brand_products bp
  left join results r on r.id = bp.result_id
  left join product_filter_facts f on f.result_id = bp.result_id
  where bp.asin is not null
) x where newest;
revoke all on product_list from anon, authenticated;
