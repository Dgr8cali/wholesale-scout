-- The price basis for profit (Settings → Business): current Buy Box, its 90-day or 12-month median,
-- or Conservative (the lower of the current Buy Box and the 90-day median), the new default. Every
-- screening profile follows it; screenings made on another basis show as stale until re-checked.
insert into business_settings (key, value) values ('priceBasis', '"lower90"'::jsonb) on conflict (key) do nothing;
update profiles set config = jsonb_set(config, '{scoringPrice}', '"lower90"'::jsonb, true);
