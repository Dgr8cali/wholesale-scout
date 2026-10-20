-- Today's Next steps: "Later" snoozes a step for 24 hours; "Done" dismisses it while the condition
-- behind it (its fingerprint) stays the same. Additive: a new table only.
create table if not exists today_step_state (
  step_id text primary key,
  fingerprint text,
  snoozed_until timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table today_step_state enable row level security;
revoke all on table today_step_state from anon, authenticated;
