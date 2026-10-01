-- A value worked out from Opportunity Explorer's data rather than read off it (the niche's search
-- conversion when Amazon doesn't state it): its own source, shown as "POE (derived)".
alter table pl_candidate_fields drop constraint if exists pl_candidate_fields_source_check;
alter table pl_candidate_fields add constraint pl_candidate_fields_source_check check (source in ('keepa', 'poe', 'poe_derived', 'manual', 'fees'));

-- Where a capture's search conversion came from: the niche's own figure, its weekly trend, or its search terms.
alter table pl_poe_snapshots add column if not exists search_conversion_source text check (search_conversion_source in ('niche', 'trends', 'terms'));
