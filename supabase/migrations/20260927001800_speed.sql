-- Speed: indexes for the queries the pages make, results.updated_at kept by the database (the
-- run page loads only rows changed since its last fetch), and supplier figures in one query.
-- Safe to re-run.

-- A run's rows in the page's order, by verdict, and changed since a time.
create index if not exists results_run_score on results (run_id, score desc nulls last, id);
create index if not exists results_run_verdict_score on results (run_id, verdict, score desc nulls last);
create index if not exists results_run_updated on results (run_id, updated_at);
create index if not exists results_updated on results (updated_at) where status = 'done';
create index if not exists results_offer on results (offer_id);
create index if not exists results_product on results (product_id);
-- Products by EAN alone (the unique index leads with it, but not every query gives the ASIN).
create index if not exists products_ean on products (ean);
create index if not exists favourites_created on favourites (created_at desc);
create index if not exists offers_seen on offers (supplier_id, seen_at desc);
create index if not exists brand_products_verdict on brand_products (brand_key, verdict);

-- Every update to a result moves updated_at, whoever writes it.
create or replace function results_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists results_touch on results;
create trigger results_touch before update on results for each row execute function results_touch();

-- The Suppliers page's figures per supplier, in one query instead of paging every offer,
-- result and brand row into the app.
create or replace function supplier_stats(ids uuid[] default null)
returns table (supplier_id uuid, runs int, products int, pass int, warn int, brands jsonb, last_seen timestamptz)
language sql stable as $$
  with o as (
    select id, product_id, supplier_id, seen_at from offers where ids is null or supplier_id = any(ids)
  ),
  prod as (select distinct supplier_id, product_id from o),
  verdicts as (
    select p.supplier_id,
      count(*) filter (where bp.priced and bp.verdict = 'pass')::int pass,
      count(*) filter (where bp.priced and bp.verdict = 'warn')::int warn
    from prod p join brand_products bp on bp.product_id = p.product_id group by 1
  ),
  brand_counts as (
    select supplier_id, jsonb_agg(jsonb_build_object('brand', brand, 'count', n) order by n desc, brand) brands
    from (
      select p.supplier_id, bp.brand, count(*)::int n from prod p join brand_products bp on bp.product_id = p.product_id
      where bp.brand is not null and bp.brand <> 'Unknown brand' group by 1, 2
    ) x group by 1
  ),
  run_counts as (select o.supplier_id, count(distinct r.run_id)::int runs from o join results r on r.offer_id = o.id group by 1),
  base as (select supplier_id, count(distinct product_id)::int products, max(seen_at) last_seen from o group by 1)
  select b.supplier_id, coalesce(rc.runs, 0), b.products, coalesce(v.pass, 0), coalesce(v.warn, 0), coalesce(bc.brands, '[]'::jsonb), b.last_seen
  from base b
  left join run_counts rc on rc.supplier_id = b.supplier_id
  left join verdicts v on v.supplier_id = b.supplier_id
  left join brand_counts bc on bc.supplier_id = b.supplier_id
$$;
