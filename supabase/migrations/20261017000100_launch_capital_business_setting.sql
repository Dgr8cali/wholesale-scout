-- Launch capital moves from Private label settings ("budget") to the business settings
-- ("launchCapital"), keeping any figure already saved. Candidates can override it with their own
-- "capital" field (pl_candidate_fields, no schema change).
insert into business_settings (key, value, updated_at)
select 'launchCapital', to_jsonb(value), now() from pl_settings where key = 'budget'
on conflict (key) do nothing;

delete from pl_settings where key = 'budget';
