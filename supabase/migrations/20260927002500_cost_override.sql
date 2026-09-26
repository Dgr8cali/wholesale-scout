-- Cost override: your own cost for a product (a landed cost, or a supplier price with its VAT
-- basis), kept as an offer from the "Manual" supplier. It competes with the sheet's offer on
-- every screening and re-screen, in every run; the cheaper is scored. Safe to re-run.
alter table offers add column if not exists manual boolean not null default false;
alter table offers add column if not exists landed_gbp numeric(12,4);
alter table offers add column if not exists vat_basis text check (vat_basis in ('ex_vat', 'inc_vat'));
alter table offers add column if not exists manual_supplier text;
alter table offers add column if not exists note text;
create unique index if not exists offers_one_manual on offers (product_id) where manual;

-- The sheet's offer a result was built from (offer_id is the manual one while it wins), and
-- what the override replaced, for the row's hover.
alter table results add column if not exists sheet_offer_id uuid;
alter table results add column if not exists cost_override jsonb;

insert into suppliers (name, source_type, vat_basis, vat_rate)
values ('Manual', 'manual', 'ex_vat', 20)
on conflict (name) do nothing;
