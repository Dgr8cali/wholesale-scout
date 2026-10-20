-- Private label pipeline board (UI redesign 4b): the column a candidate sits in. Set when you move a
-- card, moved forwards by a launch step, a quote or a messaged supplier. Null: follow the data
-- (Gates 0–3 all passing → Validate, else Research), worked out in src/lib/pl/pipeline.ts.
alter table pl_candidates add column if not exists pipeline_stage text
  check (pipeline_stage in ('research', 'validate', 'sourcing', 'launch', 'live'));

-- Backfill from what the records already prove (the same rules as evidenceStage()).
update pl_candidates c set pipeline_stage = case
  when c.status = 'launched'
    or exists (select 1 from pl_launch_steps s where s.candidate_id = c.id and s.done and s.step in ('listing_live', 'first_review'))
    then 'live'
  when exists (select 1 from pl_launch_steps s where s.candidate_id = c.id and s.done
      and s.step in ('inspection_booked', 'inspection_passed', 'shipped', 'at_fba', 'listing_written', 'ads_launched'))
    then 'launch'
  when c.status = 'samples'
    or exists (select 1 from pl_launch_steps s where s.candidate_id = c.id and s.done
      and s.step in ('samples_ordered', 'samples_received', 'sample_chosen', 'trademark_filed', 'po_placed'))
    or exists (select 1 from pl_quotes q where q.candidate_id = c.id and q.status <> 'rejected')
    or exists (select 1 from pl_supplier_leads l where l.candidate_id = c.id and l.status in ('contacted', 'quoted'))
    then 'sourcing'
  else null
end
where c.pipeline_stage is null;
