-- Supplier Scout: Alibaba search results captured by the extension (only from pages you open and
-- send), scored against the candidate's targets. One row per listing per candidate: a re-capture
-- updates its price, MOQ and sold count and keeps your status and notes.

create table if not exists pl_supplier_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  source text not null default 'alibaba',
  listing_url text not null,
  store_url text,
  title text,
  price_min numeric,
  price_max numeric,
  currency text,
  price_unit text,
  moq integer,
  moq_unit text,
  supplier_name text,
  supplier_years integer,
  country text,
  rating numeric,
  review_count integer,
  badges text[] not null default '{}',
  sold_count integer,
  delivery_estimate text,
  captured_at timestamptz not null default now(),
  score numeric,
  score_breakdown jsonb,
  flags text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'rejected')),
  notes text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, listing_url)
);
create index if not exists pl_supplier_leads_candidate on pl_supplier_leads (candidate_id, score desc nulls last);

-- Private label's text settings (the RFQ template); pl_settings holds numbers only.
create table if not exists pl_text_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table pl_supplier_leads enable row level security;
alter table pl_text_settings enable row level security;
revoke all on pl_supplier_leads from anon, authenticated;
revoke all on pl_text_settings from anon, authenticated;

-- Why a lead was rejected (Reject with reason).
alter table pl_supplier_leads add column if not exists reject_reason text;
