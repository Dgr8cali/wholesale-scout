-- Private label, Gate 4: the 1–3★ reviews you paste per top-5 ASIN, mined locally for themes.

create table if not exists pl_review_dumps (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  asin text not null,
  -- The raw text as pasted from Amazon's critical-reviews page.
  text text not null,
  pasted_at timestamptz not null default now(),
  unique (candidate_id, asin)
);

-- A theme you've picked for Gate 4, or marked not fixable or to ignore.
create table if not exists pl_review_marks (
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  theme text not null,
  mark text not null check (mark in ('chosen', 'not fixable', 'ignore')),
  updated_at timestamptz not null default now(),
  primary key (candidate_id, theme)
);

-- Settings for the miner: the synonym list (editable).
create table if not exists pl_review_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table pl_review_dumps enable row level security;
alter table pl_review_marks enable row level security;
alter table pl_review_settings enable row level security;
revoke all on pl_review_dumps from anon, authenticated;
revoke all on pl_review_marks from anon, authenticated;
revoke all on pl_review_settings from anon, authenticated;

-- "Ask Claude to summarise" is logged with the Ads calls (tokens and cost per call).
alter table ads_ai_calls drop constraint if exists ads_ai_calls_feature_check;
alter table ads_ai_calls add constraint ads_ai_calls_feature_check check (feature in ('explain', 'review', 'targets', 'pl_reviews'));
