-- Private label: the supplier comparison. Freight mode and DDP, transit days, a next price tier, the
-- extras on the ex-works invoice, the samples' own status and date, sample scores and spec notes.
-- Additive only: every column is new and nullable or defaults to empty.

alter table pl_quotes add column if not exists freight_mode text check (freight_mode in ('sea', 'rail', 'air', 'express'));
-- Delivered duty paid: the freight price includes duty and import VAT.
alter table pl_quotes add column if not exists ddp boolean;
-- Days from the factory to the FBA warehouse (the longest the supplier quoted).
alter table pl_quotes add column if not exists transit_days integer check (transit_days is null or transit_days >= 0);
-- The price at a larger order, in the quote's currency (e.g. 2.85 at 1,000).
alter table pl_quotes add column if not exists next_tier_qty integer check (next_tier_qty is null or next_tier_qty > 0);
alter table pl_quotes add column if not exists next_tier_price numeric check (next_tier_price is null or next_tier_price >= 0);
-- One-off charges on the ex-works invoice, in the quote's currency: { plate, cards, shrink, other }.
alter table pl_quotes add column if not exists extras jsonb not null default '{}';
alter table pl_quotes add column if not exists sample_status text check (sample_status in ('not ordered', 'ordered', 'received'));
alter table pl_quotes add column if not exists sample_received_on date;
-- 1–5 per criterion ({ moisture, cleaning, smell, sachet, size, box }) and { note }.
alter table pl_quotes add column if not exists sample_scores jsonb not null default '{}';
-- Free text: { wipe, sachet, box, shelfLife }.
alter table pl_quotes add column if not exists spec jsonb not null default '{}';
