-- Named results filter sets, reusable on any run and on Favourites.
create table if not exists filter_sets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  filters     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table filter_sets enable row level security;
