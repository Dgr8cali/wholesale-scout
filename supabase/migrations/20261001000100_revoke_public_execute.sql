-- Functions get EXECUTE for PUBLIC by default, which anon and authenticated inherit, so revoking
-- from them alone (20261001000000) leaves supplier_stats and results_touch callable over the API.
-- The app's role (service_role) and postgres hold their own grants, so they keep working; this is
-- what the earlier migrations did function by function.
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;
