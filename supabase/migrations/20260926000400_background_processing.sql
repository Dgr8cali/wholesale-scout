-- Background processing: one worker per run at a time (a lease), when to try Keepa again,
-- and when the run last moved, so a stalled chain stops and the run page can resume it.
alter table runs
  add column if not exists lease_until      timestamptz,
  add column if not exists resume_after     timestamptz,
  add column if not exists last_progress_at timestamptz;

create index if not exists results_pending_idx on results (run_id) where status = 'pending';
