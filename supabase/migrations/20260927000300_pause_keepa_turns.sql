-- Pause / resume, whose turn it is on Keepa, and refreshing a run's stale Keepa data.
-- Safe to re-run.

-- Paused runs do no work and spend no tokens until resumed.
alter table runs add column if not exists paused_at timestamptz;
-- "Go first": the run most recently put first uses Keepa before the others (else oldest first).
alter table runs add column if not exists keepa_first_at timestamptz;

-- Send a run's rows whose Keepa history is older than p_older_than back for a fresh stage-1
-- fetch: pending, stage 'priced', history marked absent (the stored figures stay until replaced).
create or replace function public.refresh_run_keepa(p_run uuid, p_older_than timestamptz)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update results x
  set status = 'pending',
      inputs = jsonb_set(jsonb_set(x.inputs, '{stage}', '"priced"'), '{market,hasHistory}', 'false'),
      updated_at = now()
  from products p
  where x.run_id = p_run
    and p.id = x.product_id
    and p.asin is not null
    and x.status in ('done', 'error')
    and (x.inputs -> 'market' ->> 'hasHistory') = 'true'
    and not exists (
      select 1 from keepa_snapshots k where k.asin = p.asin and k.fetched_at >= p_older_than
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.refresh_run_keepa(uuid, timestamptz) from public, anon, authenticated;
