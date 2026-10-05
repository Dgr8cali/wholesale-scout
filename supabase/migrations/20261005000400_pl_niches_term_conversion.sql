-- A niche sent from Opportunity Explorer (the extension's capture, with its search terms): its best
-- search-term conversion (%), and the signal it gives: BUYING (a term at 4%+) or BROWSE_ONLY (none
-- at 2.5%+). Linked by the capture's niche title = the niche's customer need or an alias; the app
-- keeps it up to date on each capture and import. Filled here from the captures already stored.

alter table pl_niches add column if not exists best_term_conversion numeric;
alter table pl_niches add column if not exists term_signal text check (term_signal in ('BUYING', 'BROWSE_ONLY'));

with latest as (
  select distinct on (lower(niche_title)) id, lower(niche_title) title, captured_at, search_terms,
    (select max((t->>'conversion')::numeric) from jsonb_array_elements(search_terms) t where t->>'conversion' is not null) best
  from pl_poe_snapshots
  where niche_title is not null and jsonb_array_length(search_terms) > 0
  order by lower(niche_title), captured_at desc
)
update pl_niches n set
  best_term_conversion = l.best,
  term_signal = case when l.best >= 4 then 'BUYING' when l.best < 2.5 then 'BROWSE_ONLY' end,
  extra = coalesce(n.extra, '{}'::jsonb) || jsonb_build_object('poe', jsonb_build_object(
    'snapshotId', l.id, 'capturedAt', l.captured_at, 'terms', l.search_terms))
from latest l
where l.best is not null and (lower(n.customer_need) = l.title
  or exists (select 1 from jsonb_array_elements_text(coalesce(n.extra->'aliases', '[]'::jsonb)) a where lower(a) = l.title));

create index if not exists pl_niches_best_term_conversion on pl_niches (best_term_conversion desc nulls last, id);
