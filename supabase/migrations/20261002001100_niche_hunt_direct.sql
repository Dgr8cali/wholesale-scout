-- Niche Hunt, direct mode: a "finding" stage (one filtered finder query per root, a few pages)
-- before detail.
alter table pl_hunts drop constraint if exists pl_hunts_status_check;
alter table pl_hunts add constraint pl_hunts_status_check check (status in ('listing', 'sizing', 'finding', 'detailing', 'done', 'error', 'cancelled'));
