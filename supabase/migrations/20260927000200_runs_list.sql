-- Runs page: archiving, and one call for the list's per-run summaries (verdict counts,
-- suppliers, the newest Keepa data behind the run). Safe to re-run.

alter table runs add column if not exists archived_at timestamptz;

create or replace function public.run_summaries(run_ids uuid[])
returns table (
  run_id uuid,
  pass integer,
  warn integer,
  fail integer,
  error integer,
  pending integer,
  suppliers text[],
  newest_keepa timestamptz
)
language sql
stable
as $$
  select
    r.id,
    count(*) filter (where x.status = 'done' and x.verdict = 'pass')::int,
    count(*) filter (where x.status = 'done' and x.verdict = 'warn')::int,
    count(*) filter (where x.status = 'done' and x.verdict = 'fail')::int,
    count(*) filter (where x.status = 'error')::int,
    count(*) filter (where x.status = 'pending')::int,
    coalesce(array_agg(distinct s.name) filter (where s.name is not null), '{}'),
    (select max(k.fetched_at) from keepa_snapshots k
      where k.asin in (select p2.asin from results x2 join products p2 on p2.id = x2.product_id where x2.run_id = r.id and p2.asin is not null))
  from runs r
  left join results x on x.run_id = r.id
  left join offers o on o.id = x.offer_id
  left join suppliers s on s.id = o.supplier_id
  where r.id = any(run_ids)
  group by r.id;
$$;

revoke all on function public.run_summaries(uuid[]) from public, anon, authenticated;
