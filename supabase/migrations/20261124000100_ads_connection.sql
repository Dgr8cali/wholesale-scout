-- Amazon Ads API connection: one row. The LWA refresh token is stored encrypted (AES-256-GCM,
-- key from the server's env; see src/lib/adsapi/crypto.ts), never as plain text.
create table if not exists ads_connection (
  id smallint primary key default 1 check (id = 1),
  refresh_token_enc text not null,
  profile_id text,
  profile_name text,
  profile_country text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ads_connection enable row level security;
revoke all on table ads_connection from anon, authenticated;
