-- "Approval needed" now warns by default (blocked still fails). Saved profiles store the old
-- default explicitly, so move any that still say "fail" to "warn". Set it back per profile in
-- Settings → Gates → Gating and blocks if you want approval-needed listings dropped.
update profiles
set config = jsonb_set(config, '{gates,gating,approvalRequired}', '"warn"'),
    updated_at = now()
where config #>> '{gates,gating,approvalRequired}' = 'fail';
