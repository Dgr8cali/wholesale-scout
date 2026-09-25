-- Multipacks: how many units an Amazon listing is (from its title and the catalog's
-- item_package_quantity / number_of_items), so a single's cost is scaled to the listing's
-- pack. Safe to re-run.

alter table products add column if not exists pack_count integer;
-- Amazon's pack attributes as read: { itemPackageQuantity, numberOfItems }.
alter table products add column if not exists pack_attrs jsonb;
