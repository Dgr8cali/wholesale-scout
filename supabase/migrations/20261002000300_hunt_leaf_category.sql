-- Niche Hunt groups ASINs by their leaf browse category (Amazon's own grouping of like products,
-- e.g. Cutlery Trays), falling back to a phrase from the title.
alter table pl_hunt_asins add column if not exists leaf_category_id bigint;
alter table pl_hunt_asins add column if not exists leaf_category text;
