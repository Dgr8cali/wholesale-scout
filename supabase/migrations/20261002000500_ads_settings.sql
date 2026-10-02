-- The Ads workspace's settings (nothing reads them yet): the target ACoS, 30% by default.
create table if not exists ads_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
insert into ads_settings (key, value) values ('targetAcos', 30) on conflict (key) do nothing;

alter table ads_settings enable row level security;
revoke all on table ads_settings from anon, authenticated;
