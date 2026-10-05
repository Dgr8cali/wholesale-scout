-- Gate 2's reference listing: by default the page-one ASIN with the longest Keepa history (the app
-- moves it there on refresh); once you pick one in Gate 2 it stays yours.

alter table pl_candidates add column if not exists reference_pinned boolean not null default false;
