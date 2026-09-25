-- A name for each run, editable in the app; defaults to the uploaded file names.
alter table runs add column if not exists name text;
update runs set name = source where name is null;
