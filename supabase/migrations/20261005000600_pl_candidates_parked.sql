-- Candidates can be parked: shelved with a reason, not deleted. The status it was parked from is
-- kept so unparking puts it back.

alter table pl_candidates drop constraint if exists pl_candidates_status_check;
alter table pl_candidates add constraint pl_candidates_status_check
  check (status in ('draft', 'researching', 'samples', 'dropped', 'launched', 'parked'));
alter table pl_candidates add column if not exists park_reason text;
alter table pl_candidates add column if not exists parked_at timestamptz;
alter table pl_candidates add column if not exists parked_from text;
