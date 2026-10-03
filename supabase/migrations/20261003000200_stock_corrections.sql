-- Stock: correcting mistakes. Items can be archived (soft-deleted) and restored; a transfer's two
-- halves are linked so deleting one deletes both; every edit and delete is kept in stock_audit.

alter table stock_items add column if not exists archived_at timestamptz;

alter table stock_movements add column if not exists transfer_id uuid;
create index if not exists stock_movements_transfer on stock_movements (transfer_id);

-- Pair the existing halves: by import id ("<id>:out" / "<id>:in"), else the same item, date and
-- quantity, nearest in time.
do $$
declare o record; i_id uuid; g uuid;
begin
  for o in select * from stock_movements where kind = 'transfer_out' and transfer_id is null order by created_at loop
    select id into i_id from stock_movements i
      where i.kind = 'transfer_in' and i.transfer_id is null and i.item_id = o.item_id
        and ((o.source_ref is not null and i.source_ref = regexp_replace(o.source_ref, ':out$', ':in'))
          or (i.date = o.date and i.quantity = -o.quantity))
      order by (o.source_ref is not null and i.source_ref = regexp_replace(o.source_ref, ':out$', ':in')) desc, abs(extract(epoch from i.created_at - o.created_at))
      limit 1;
    if i_id is not null then
      g := gen_random_uuid();
      update stock_movements set transfer_id = g where id in (o.id, i_id);
    end if;
  end loop;
end $$;

create table if not exists stock_audit (
  id uuid primary key default gen_random_uuid(),
  -- movement, item, sale, purchase, listing
  entity text not null,
  entity_id uuid,
  -- edit, delete, archive, restore, purge
  action text not null,
  -- One line a person reads: "Deleted a sale of 2 × PILL-BOX from Self-ship (2026-09-14)".
  summary text not null,
  -- Who: the app has one user behind the password gate; the page or job that did it.
  actor text not null default 'you',
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists stock_audit_created on stock_audit (created_at desc);

alter table stock_audit enable row level security;
revoke all on stock_audit from anon, authenticated;
