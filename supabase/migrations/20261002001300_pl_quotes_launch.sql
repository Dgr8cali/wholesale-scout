-- Private label, phase E: supplier quotes with a landed-cost calculator, and the launch checklist.

create table if not exists pl_quotes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  supplier_name text not null,
  source text not null default 'Alibaba' check (source in ('Alibaba', '1688', 'UK wholesaler', 'Other')),
  contact text,
  -- Ex-works, per unit, in the quote's currency.
  unit_price numeric,
  currency text not null default 'USD' check (currency in ('USD', 'GBP', 'CNY', 'EUR')),
  moq integer,
  lead_time_days integer,
  sample_cost numeric,
  sample_lead_days integer,
  notes text,
  status text not null default 'requested' check (status in ('requested', 'received', 'samples ordered', 'samples received', 'chosen', 'rejected')),
  -- The landed-cost calculator's inputs: units, fx, freight, dutyPct, vat, inspection, other.
  calc jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pl_quotes_candidate on pl_quotes (candidate_id);

-- The launch checklist: one row per step done or noted.
create table if not exists pl_launch_steps (
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  step text not null,
  done boolean not null default false,
  done_on date,
  note text,
  -- What the step cost, £ (the budget tracker sums it per Gate 7 line).
  spend numeric,
  updated_at timestamptz not null default now(),
  primary key (candidate_id, step)
);

-- The candidate's own listing once it exists, and the chosen quote's landed cost.
alter table pl_candidates add column if not exists listing_asin text;
alter table pl_candidates add column if not exists chosen_quote uuid references pl_quotes(id) on delete set null;
alter table pl_candidates add column if not exists chosen_landed numeric;
-- An Ads product made from a candidate (its listing ASIN): profit after ads shows on both.
alter table ads_products add column if not exists pl_candidate_id uuid references pl_candidates(id) on delete set null;

-- A field can now come from a quote (Gate 0 landed cost, Gate 7 units); a manual value still wins.
alter table pl_candidate_fields drop constraint if exists pl_candidate_fields_source_check;
alter table pl_candidate_fields add constraint pl_candidate_fields_source_check check (source in ('keepa', 'poe', 'poe_derived', 'manual', 'fees', 'quote'));

alter table pl_quotes enable row level security;
alter table pl_launch_steps enable row level security;
revoke all on table pl_quotes, pl_launch_steps from anon, authenticated;
