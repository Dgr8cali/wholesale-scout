-- Amazon's own dangerous-goods data on a product (the catalog's hazmat, GHS, declared
-- regulation and is_heat_sensitive attributes), used by the compliance gate ahead of keyword
-- matching; and a Meltable rule for what Amazon marks heat-sensitive. Safe to re-run.

alter table products add column if not exists amazon_dg jsonb;

insert into category_rules (key, name, keywords, amazon_categories, note, checklist, sort)
values (
  'meltable',
  'Meltable',
  '{}',
  '{}',
  'Amazon marks it heat-sensitive: FBA only accepts meltable inventory from mid-October to mid-April, and removes what''s left in summer.',
  array['Check the meltable season before sending', 'Plan to sell through or remove by April'],
  10
)
on conflict (key) do nothing;
