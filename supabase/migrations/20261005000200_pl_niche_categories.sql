-- A niche can appear in several categories' downloads (pool heater: DIY & Tools and Garden). One row
-- per niche (identical search terms and search volume), with every category it appeared in. The app
-- merges the duplicates (status, notes, shape, ledgers) on each import and once for existing rows.

alter table pl_niches add column if not exists categories text[] not null default '{}';
update pl_niches n set categories = array[i.category]
  from pl_niche_imports i where i.id = n.import_id and n.categories = '{}';
create index if not exists pl_niches_categories on pl_niches using gin (categories);
