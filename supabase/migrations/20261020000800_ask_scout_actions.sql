-- Ask Scout proposes actions you confirm one at a time. Additive only.

-- The actions proposed with an answer: [{ id, type, params, target, summary, href }].
alter table ask_scout_history add column if not exists actions jsonb not null default '[]'::jsonb;

-- A candidate's next-action note (one of the actions Scout can propose; also typed on the candidate).
alter table pl_candidates add column if not exists next_action_note text;

-- Every confirmed (or declined) action: who, when, what, and the record's state before, for Undo.
-- No foreign key to the history: the log outlives the 20 questions kept.
create table if not exists ask_scout_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  action_id text not null,
  type text not null,
  -- { kind, id, label }: the record it changed.
  target jsonb not null,
  summary text not null,
  status text not null check (status in ('running', 'done', 'failed', 'declined', 'undone')),
  before jsonb,
  after jsonb,
  error text,
  actor text not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  undone_at timestamptz,
  -- Confirm runs an action once.
  unique (run_id, action_id)
);
create index if not exists ask_scout_actions_created on ask_scout_actions (created_at desc);
alter table ask_scout_actions enable row level security;
revoke all on table ask_scout_actions from anon, authenticated;
