-- Password gate rate limit: wrong passwords counted per IP; too many in the window blocks the
-- IP for a while (every server instance reads the blocked list). Safe to re-run.
create table if not exists auth_failures (
  ip             text primary key,
  failures       integer not null default 0,
  first_at       timestamptz not null default now(),
  blocked_until  timestamptz
);
create index if not exists auth_failures_blocked on auth_failures (blocked_until) where blocked_until is not null;
alter table auth_failures enable row level security;

-- One wrong password from an IP: count it (a new window after p_window), block when it reaches
-- p_max. Returns when the block ends, or null.
create or replace function record_auth_failure(p_ip text, p_max integer, p_window interval, p_block interval)
returns timestamptz language plpgsql as $$
declare
  r auth_failures;
begin
  insert into auth_failures as a (ip, failures, first_at) values (p_ip, 1, now())
  on conflict (ip) do update set
    failures = case when a.first_at < now() - p_window then 1 else a.failures + 1 end,
    first_at = case when a.first_at < now() - p_window then now() else a.first_at end
  returning * into r;
  if r.failures >= p_max then
    update auth_failures set blocked_until = now() + p_block, failures = 0, first_at = now() where ip = p_ip
    returning * into r;
  end if;
  return r.blocked_until;
end $$;
revoke all on function record_auth_failure(text, integer, interval, interval) from public, anon, authenticated;
