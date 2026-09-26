-- Compliance: exclusion words on every rule (a title containing one skips the rule), a
-- Medical device rule, and Amazon's own category signals kept on products (the catalog's
-- browse path, item-type keyword and product type) for rules to match. Safe to re-run.
alter table category_rules add column if not exists exclusions text[] not null default '{}';
alter table products add column if not exists amazon_signals text[];

insert into category_rules (key, name, keywords, amazon_categories, note, checklist, sort, exclusions)
values (
  'medicalDevice',
  'Medical device',
  array['treatment', 'medicated', 'antifungal', 'anti-fungal', 'antiseptic', 'anti-septic', 'wound', 'wounds', 'first aid', 'plasters', 'bandage', 'bandages', 'cold sore', 'verruca', 'athlete''s foot', 'haemorrhoid', 'haemorrhoids'],
  array['/medical|first[ -]?aid|pharmac|over[ -]the[ -]counter|\botc\b|medicat/'],
  'Medical devices and medicines: UKCA or CE marking (MHRA-registered), Amazon category approval, and FBA''s minimum 105 days of shelf life left on arrival.',
  array['UKCA or CE mark on the pack, device registered with the MHRA', 'Amazon category approval (Health & Personal Care: medical)', 'At least 105 days of shelf life left when it reaches FBA', 'No medicinal claims on a product that isn''t a licensed medicine'],
  4,
  array['hair', 'scalp', 'lash', 'brow', 'lip']
)
on conflict (key) do nothing;
