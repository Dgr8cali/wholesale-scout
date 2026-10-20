-- Ask Scout: the last 20 questions about your own data with their answers, the read-only lookups
-- they made and what they cost; each one is also logged in the AI call log (feature ask_scout).
-- Additive: a new table, and the call log's feature list widened.
create table if not exists ask_scout_history (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer jsonb,
  error text,
  -- [{ name, input }]: the lookups the answer made.
  tools jsonb not null default '[]'::jsonb,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric not null default 0,
  cost_gbp numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ask_scout_history_created on ask_scout_history (created_at desc);
alter table ask_scout_history enable row level security;
revoke all on table ask_scout_history from anon, authenticated;

alter table ads_ai_calls drop constraint if exists ads_ai_calls_feature_check;
alter table ads_ai_calls add constraint ads_ai_calls_feature_check check (feature in ('explain', 'review', 'targets', 'pl_reviews', 'pl_listing', 'ask_scout'));
