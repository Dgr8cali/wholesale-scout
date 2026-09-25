-- Favourites: a plain unique key on (ean, asin), with a missing ASIN counting as equal, so
-- starring and saving a note can be one atomic upsert (on conflict (ean, asin)). The old key
-- was on an expression (coalesce(asin, '')), which an upsert can't target, so a note and a
-- star saved at the same moment both inserted and one failed. Safe to re-run.

drop index if exists favourites_ean_asin_key;
create unique index favourites_ean_asin_key on favourites (ean, asin) nulls not distinct;
