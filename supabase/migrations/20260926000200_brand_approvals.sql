-- Brand approvals: where each "approval needed" brand stands on your account. Gate 11
-- treats a brand marked approved as open for approval-needed listings.
create table if not exists brand_approvals (
  id            uuid primary key default gen_random_uuid(),
  brand_key     text not null unique,   -- normalised: accents folded, lower case, letters and digits only
  brand         text not null,          -- as displayed
  status        text not null default 'not_applied'
                  check (status in ('not_applied', 'applied', 'approved', 'refused')),
  requirement   text,                   -- e.g. "3 invoices, 30 units, last 180 days"
  status_date   date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table brand_approvals enable row level security;
