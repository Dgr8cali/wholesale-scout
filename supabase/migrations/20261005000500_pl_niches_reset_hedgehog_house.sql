-- Hedgehog house (Garden) was checked when the search stayed inside Garden, where Amazon files none
-- (they sit under Pet Supplies / Wildlife): "no on-niche sellers, 0 detailed". Clear that check so
-- it can be rerun with the search outside the category. Its Keepa ledger is kept.

update pl_niches
   set shape = null, shape_rank = null, extra = extra - 'incumbents', updated_at = now()
 where lower(customer_need) = 'hedgehog house' and extra ? 'incumbents';
