-- The first incumbent checks matched any title with the term's words across all of Amazon (bath
-- toys and a cat toy for "fishing rod", dry bags for "fishing bag"). Clear the shapes they wrote so
-- the niches can be checked again, in their category and on-niche titles only. Ledgers are kept.

update pl_niches
   set shape = null, shape_rank = null, extra = extra - 'incumbents', updated_at = now()
 where lower(customer_need) in ('fishing', 'tackle box', 'fishing bag') and shape is not null;
