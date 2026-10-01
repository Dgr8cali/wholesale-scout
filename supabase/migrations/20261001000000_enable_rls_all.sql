-- RLS on every public table, and nothing granted to the API's public roles (Supabase advisor:
-- rls_disabled_in_public). The app reaches the database only through DATABASE_URL and the
-- service-role key, which bypass RLS; the anon key is never used, so no policies are needed.
-- Idempotent: safe to run again, and it covers tables added later by earlier-forgotten migrations.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
