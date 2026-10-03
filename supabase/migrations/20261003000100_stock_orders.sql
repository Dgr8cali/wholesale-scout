-- Stock fixes: suppliers created from Stock (with a type), and order details on purchases and
-- receipts (the supplier's order number and page, dates, tracking, currency).

-- What kind of supplier: a manufacturer, a wholesaler, a marketplace seller (Alibaba, 1688, eBay,
-- Amazon…, named in `marketplace`), or a retailer.
alter table suppliers add column if not exists kind text check (kind in ('manufacturer', 'wholesaler', 'marketplace', 'retailer'));
alter table suppliers add column if not exists marketplace text;
-- 'stock': added from Stock (an item, an order, a receipt), with no price lists.
alter table suppliers drop constraint if exists suppliers_source_type_check;
alter table suppliers add constraint suppliers_source_type_check check (source_type in ('upload', 'qogita', 'manual', 'stock'));
update suppliers set source_type = 'stock' where notes = 'Added by the StockPilot import' and source_type = 'upload';
update suppliers set kind = 'marketplace', marketplace = 'eBay' where name ilike 'ebay - %' and kind is null;

-- The supplier's side of an order. ordered_on (existing) is the order date; note (existing) the notes.
alter table purchases
  add column if not exists order_id text,
  add column if not exists order_url text,
  add column if not exists expected_date date,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  -- When not GBP: the price paid per unit in that currency, and £ per 1 unit of it.
  add column if not exists currency char(3) not null default 'GBP',
  add column if not exists fx_rate numeric check (fx_rate > 0),
  add column if not exists unit_cost_ccy numeric;

-- A receipt carries its order too (from its purchase, or typed on Receive).
alter table stock_movements
  add column if not exists supplier_id uuid references suppliers(id) on delete set null,
  add column if not exists order_id text,
  add column if not exists order_url text,
  add column if not exists ordered_date date,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists currency char(3),
  add column if not exists fx_rate numeric check (fx_rate > 0),
  add column if not exists unit_cost_ccy numeric;
create index if not exists stock_movements_supplier on stock_movements (supplier_id);
create index if not exists purchases_supplier on purchases (supplier_id);
