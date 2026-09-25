-- Per-product gate waivers: a waived gate's fail becomes a warn for that product (EAN + ASIN),
-- in every run, until un-waived.
create table if not exists gate_overrides (
  id          uuid primary key default gen_random_uuid(),
  ean         text not null,
  asin        text,
  gate        text not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create unique index if not exists gate_overrides_key on gate_overrides (ean, coalesce(asin, ''), gate);

alter table gate_overrides enable row level security;
