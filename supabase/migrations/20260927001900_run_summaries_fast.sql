-- run_summaries without a per-run subquery: each ASIN's newest snapshot is found once, then
-- rolled up per run. Same columns as before. Safe to re-run.
create or replace function public.run_summaries(run_ids uuid[])
returns table (run_id uuid, pass integer, warn integer, fail integer, error integer, pending integer, suppliers text[], newest_keepa timestamptz)
language sql
stable
as $$
  with x as (
    select r.run_id, r.status, r.verdict, r.offer_id, r.product_id from results r where r.run_id = any(run_ids)
  ),
  counts as (
    select run_id,
      count(*) filter (where status = 'done' and verdict = 'pass')::int pass,
      count(*) filter (where status = 'done' and verdict = 'warn')::int warn,
      count(*) filter (where status = 'done' and verdict = 'fail')::int fail,
      count(*) filter (where status = 'error')::int error,
      count(*) filter (where status = 'pending')::int pending
    from x group by run_id
  ),
  sup as (
    select x.run_id, array_agg(distinct s.name) names
    from x join offers o on o.id = x.offer_id join suppliers s on s.id = o.supplier_id group by x.run_id
  ),
  newest as (select asin, max(fetched_at) at from keepa_snapshots group by asin),
  keepa as (
    select x.run_id, max(n.at) at from x join products p on p.id = x.product_id join newest n on n.asin = p.asin group by x.run_id
  )
  select r.id, coalesce(c.pass, 0), coalesce(c.warn, 0), coalesce(c.fail, 0), coalesce(c.error, 0), coalesce(c.pending, 0),
    coalesce(s.names, '{}'), k.at
  from runs r
  left join counts c on c.run_id = r.id
  left join sup s on s.run_id = r.id
  left join keepa k on k.run_id = r.id
  where r.id = any(run_ids);
$$;
revoke all on function public.run_summaries(uuid[]) from public, anon, authenticated;
