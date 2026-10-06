-- Gate 4's reviews for an ASIN that isn't on the candidate: removed from it (the reviews kept, the
-- box labelled), or received from the extension and kept separate when you chose not to add it.

alter table pl_review_dumps add column if not exists removed_at timestamptz;
alter table pl_review_dumps add column if not exists kept_separate boolean not null default false;
