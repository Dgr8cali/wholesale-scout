-- Niche Import, paged on the server: columns to filter and sort by in SQL (PostgREST can't order by
-- an expression), kept up to date by the app and filled here for the rows already imported.

alter table pl_niches add column if not exists search_text text;
alter table pl_niches add column if not exists first_term text;
alter table pl_niches add column if not exists flag_count integer not null default 0;
alter table pl_niches add column if not exists shape_rank integer;

update pl_niches set
  search_text = lower(customer_need || ' ' || array_to_string(search_terms, ' ') || ' ' ||
    coalesce((select string_agg(a, ' ') from jsonb_array_elements_text(coalesce(extra->'aliases', '[]'::jsonb)) a), '')),
  first_term = search_terms[1],
  flag_count = coalesce(array_length(flags, 1), 0),
  shape_rank = case shape when 'open' then 0 when 'contested' then 1 when 'dominated' then 2 end;

create index if not exists pl_niches_score on pl_niches (score desc nulls last, id);
create index if not exists pl_niches_status on pl_niches (status);
