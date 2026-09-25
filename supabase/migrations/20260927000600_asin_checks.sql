-- ASIN checks: a pasted ASIN may come with no cost. Such an offer is stored at 0 with
-- cost_known false, and screened without the fee and budget gates. Safe to re-run.

alter table offers add column if not exists cost_known boolean not null default true;
