-- Document store: invoices, SDS, brand letters and other files, kept in a private Supabase
-- Storage bucket and listed on brand and supplier pages and in the Apply flow. Safe to re-run.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('invoice', 'sds', 'brand_letter', 'other')),
  doc_date      date,
  note          text,
  -- Brands it's for (brand keys, as on the Brands page) and the supplier it's from, if any.
  brand_keys    text[] not null default '{}',
  supplier_id   uuid references suppliers(id) on delete set null,
  file_name     text not null,
  path          text not null unique,
  size_bytes    bigint,
  content_type  text,
  -- False until the browser's upload to storage is confirmed.
  uploaded      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists documents_brand_keys on documents using gin (brand_keys);
create index if not exists documents_supplier on documents (supplier_id);
alter table documents enable row level security;
