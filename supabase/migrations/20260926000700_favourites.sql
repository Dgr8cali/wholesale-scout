-- Favourite products, by EAN + ASIN (not by run), with an optional note.
create table if not exists favourites (
  id          uuid primary key default gen_random_uuid(),
  ean         text not null,
  asin        text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists favourites_ean_asin_key on favourites (ean, coalesce(asin, ''));

alter table favourites enable row level security;
