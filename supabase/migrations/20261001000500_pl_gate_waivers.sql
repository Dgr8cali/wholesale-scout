-- Private label gate waivers: a waived check counts as a pass for its gate's status (a null
-- check_label waives the whole gate). The verdict still names every waived check.
create table if not exists pl_gate_waivers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  gate_id text not null check (gate_id in ('g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7')),
  check_label text,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists pl_gate_waivers_key on pl_gate_waivers (candidate_id, gate_id, coalesce(check_label, ''));

-- Like every other table: RLS on, no policies, nothing for the public API roles.
alter table pl_gate_waivers enable row level security;
revoke all on table pl_gate_waivers from anon, authenticated;
