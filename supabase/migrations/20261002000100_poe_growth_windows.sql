-- Opportunity Explorer shows search volume growth over the past 180 and 90 days (fractions in the
-- payload: 0.0592 is +5.92%). search_volume_growth holds the 180-day figure, Gate 3's input; the
-- 90- and 360-day figures are kept beside it, and where the figure came from.
alter table pl_poe_snapshots add column if not exists search_volume_growth_90 numeric;
alter table pl_poe_snapshots add column if not exists search_volume_growth_360 numeric;
alter table pl_poe_snapshots add column if not exists search_volume_growth_source text check (search_volume_growth_source in ('t180', 't90', 'trends'));
