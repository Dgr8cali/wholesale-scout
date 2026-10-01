-- Supabase advisor: function_search_path_mutable. Pin each function's search_path so a caller's
-- own search_path can't swap in another schema's tables or functions. pg_temp goes last so a
-- temporary object can't shadow a public one. (The watchdog already pins public, extensions.)
-- Signatures as in supabase/schema.sql, so each ALTER matches exactly one function.
alter function public.supplier_stats(ids uuid[]) set search_path = public, pg_temp;
alter function public.record_auth_failure(p_ip text, p_max integer, p_window interval, p_block interval) set search_path = public, pg_temp;
alter function public.run_summaries(run_ids uuid[]) set search_path = public, pg_temp;
alter function public.refresh_run_keepa(p_run uuid, p_older_than timestamp with time zone) set search_path = public, pg_temp;
alter function public.results_touch() set search_path = public, pg_temp;
