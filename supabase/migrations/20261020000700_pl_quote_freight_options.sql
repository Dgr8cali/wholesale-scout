-- Private label: a quote can hold several freight options (sea, rail, air, express), one of them used
-- for the landed cost. Each: { id, mode, ddp (true / false / null when not said), cost, currency,
-- transit_days, used }. With none, the quote's single freight fields apply as before. Additive only.
alter table pl_quotes add column if not exists freight_options jsonb not null default '[]';
