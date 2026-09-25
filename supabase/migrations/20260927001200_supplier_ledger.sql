-- Supplier ledger: one record per supplier (upload, Qogita, manual) with what you know about
-- dealing with them. Adds the missing fields, turns importer of record into yes/no, keeps
-- labelling to UK / EU / mixed, and marks Qogita and manual checks for what they are.
-- Safe to re-run.

alter table suppliers
  add column if not exists website                       text,
  add column if not exists contact                       text,
  add column if not exists payment_terms                 text,
  -- Does the invoice name match your selling account; is it accepted for brand approval.
  add column if not exists invoice_name_matches          boolean,
  add column if not exists invoice_accepted_for_approval boolean;

-- Importer of record: yes / no (it was free text, unused so far).
do $$
begin
  if (select data_type from information_schema.columns where table_name = 'suppliers' and column_name = 'importer_of_record') = 'text' then
    alter table suppliers alter column importer_of_record type boolean using (
      case lower(trim(importer_of_record)) when 'yes' then true when 'y' then true when 'true' then true
        when 'no' then false when 'n' then false when 'false' then false else null end
    );
  end if;
end $$;

update suppliers set labelling = case lower(trim(labelling)) when 'uk' then 'UK' when 'eu' then 'EU' when 'mixed' then 'mixed' else null end
  where labelling is not null and labelling not in ('UK', 'EU', 'mixed');
alter table suppliers drop constraint if exists suppliers_labelling_check;
alter table suppliers add constraint suppliers_labelling_check check (labelling in ('UK', 'EU', 'mixed'));

-- Ratings are 1–5 (0 meant unrated).
update suppliers set rating = null where rating = 0;
alter table suppliers drop constraint if exists suppliers_rating_check;
alter table suppliers add constraint suppliers_rating_check check (rating between 1 and 5);

-- What's already known: Qogita pulls, and Check ASINs / seller scans.
update suppliers set source_type = 'qogita', website = coalesce(website, 'https://www.qogita.com') where name = 'Qogita';
update suppliers set source_type = 'manual' where name = 'Manual';
