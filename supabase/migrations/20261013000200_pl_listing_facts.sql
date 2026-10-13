-- Listing Writer: what the seller says about the product, per candidate (brand, key specs one per
-- line, suitable for / not for as comma lists, claims never to state).
alter table pl_candidates add column if not exists listing_brand text;
alter table pl_candidates add column if not exists listing_specs text;
alter table pl_candidates add column if not exists listing_suitable text;
alter table pl_candidates add column if not exists listing_not_for text;
alter table pl_candidates add column if not exists listing_avoid text;
