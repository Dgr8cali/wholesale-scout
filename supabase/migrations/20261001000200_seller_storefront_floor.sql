-- Keepa's storefront count can be years stale while its brand statistics are current: a seller
-- stored with 9 listings had 113 of one brand, so the screen called it 1,256% that brand. The
-- parser now floors the size at the brand and category counts; this repairs sellers already
-- stored, from the brand counts kept with them (the next lookup refreshes them properly).
update keepa_sellers s
set storefront_size = t.total
from (
  select seller_id, sum((b->>'count')::int) total
  from keepa_sellers, jsonb_array_elements(coalesce(brands, '[]'::jsonb)) b
  group by seller_id
) t
where t.seller_id = s.seller_id and t.total > coalesce(s.storefront_size, 0);
