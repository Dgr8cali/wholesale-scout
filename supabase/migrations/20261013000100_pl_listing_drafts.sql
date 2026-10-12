-- Private label's Listing Writer: every generated or edited version of a candidate's listing
-- (title, five bullets, description, backend search terms, differentiation angle) with the inputs
-- it was written from; and the candidate's listing settings (brand voice, pack size, title limit).

create table if not exists pl_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references pl_candidates(id) on delete cascade,
  version integer not null,
  -- "generated", "regenerated <field>", "edited", "restored vN"
  source text not null default 'generated',
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null,
  created_at timestamptz not null default now(),
  unique (candidate_id, version)
);
create index if not exists pl_listing_drafts_candidate on pl_listing_drafts (candidate_id, version desc);
alter table pl_listing_drafts enable row level security;
revoke all on pl_listing_drafts from anon, authenticated;

alter table pl_candidates add column if not exists listing_voice text;
alter table pl_candidates add column if not exists listing_pack text;
alter table pl_candidates add column if not exists listing_title_limit integer;

-- The listing's model calls are logged with the Ads and review-summary calls.
alter table ads_ai_calls drop constraint if exists ads_ai_calls_feature_check;
alter table ads_ai_calls add constraint ads_ai_calls_feature_check check (feature in ('explain', 'review', 'targets', 'pl_reviews', 'pl_listing'));
