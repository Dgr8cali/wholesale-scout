-- Measured throughput and Keepa's last token figures, for the time-remaining estimate.
alter table runs add column if not exists stats jsonb;
