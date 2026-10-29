-- Sign-in: passkeys (WebAuthn), email sign-in links, sessions per device, and API tokens for the
-- Chrome extension. Replaces the HTTP Basic APP_PASSWORD gate (which stays as an emergency fallback).
-- Additive only: every table is new. RLS on with no policies: only the service key reads them.

-- A passkey (Face ID / Touch ID / Windows Hello / a phone). The public key only; the private key
-- never leaves the device.
create table if not exists auth_passkeys (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  credential_id text not null unique,          -- base64url
  public_key text not null,                    -- base64url COSE key
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,                            -- singleDevice | multiDevice (synced, e.g. iCloud Keychain)
  backed_up boolean,
  name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- A signed-in browser. The cookie holds a random token; only its SHA-256 is stored.
-- 90 days, sliding: each use (at most hourly) moves expires_at on.
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  method text not null check (method in ('passkey', 'email', 'password')),
  passkey_id uuid references auth_passkeys(id) on delete set null,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists auth_sessions_active on auth_sessions (expires_at) where revoked_at is null;

-- A WebAuthn challenge, used once within five minutes.
create table if not exists auth_challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('register', 'login')),
  challenge text not null,
  email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- An emailed sign-in link: its token's SHA-256, used once within 15 minutes.
create table if not exists auth_email_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- A per-device API token (the Chrome extension): shown once, stored as its SHA-256, revocable,
-- and only accepted on the scope's endpoints.
create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  prefix text not null,                         -- the first characters, to recognise it in the list
  scope text not null default 'extension' check (scope in ('extension')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_ip text,
  revoked_at timestamptz
);

alter table auth_passkeys enable row level security;
alter table auth_sessions enable row level security;
alter table auth_challenges enable row level security;
alter table auth_email_links enable row level security;
alter table api_tokens enable row level security;
