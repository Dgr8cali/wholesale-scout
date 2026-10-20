-- Private label: each candidate's own sample-score criteria and spec labels (the supplier comparison and
-- the quote form). Null: the generic set. Each is [{ k, label }]; renaming a label keeps its key, so
-- the scores and spec notes already given stay with it. Additive only.
alter table pl_candidates add column if not exists sample_criteria jsonb;
alter table pl_candidates add column if not exists spec_fields jsonb;
