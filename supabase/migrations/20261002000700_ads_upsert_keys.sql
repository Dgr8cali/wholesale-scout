-- Upserts (re-importing a file) need plain unique constraints, not expression indexes: nulls are
-- "not distinct", so a Campaign Manager row (no start date) is the same row when imported again.
drop index if exists ads_campaign_ranges_key;
alter table ads_campaign_ranges add constraint ads_campaign_ranges_key unique nulls not distinct (campaign, source, date_from, date_to);

drop index if exists ads_search_terms_key;
update ads_search_terms set ad_group_id = '' where ad_group_id is null;
alter table ads_search_terms alter column ad_group_id set default '';
alter table ads_search_terms alter column ad_group_id set not null;
alter table ads_search_terms add constraint ads_search_terms_key unique (campaign, ad_group_id, term, date_from, date_to);
