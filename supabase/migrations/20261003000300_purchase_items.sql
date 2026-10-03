-- Every purchase links to a stock item: a product-page purchase finds or creates the item by ASIN,
-- copying the catalogue product's title, image, brand and package data, so it's the same record as
-- one made from Stock. (Existing purchases are linked by the app's backfill: POST /api/stock/backfill.)

alter table stock_items
  add column if not exists brand text,
  add column if not exists weight_g numeric,
  add column if not exists dims_cm jsonb,
  -- The catalogue product it came from, when there is one.
  add column if not exists product_id uuid references products(id) on delete set null,
  -- When an image was last looked for (catalogue, Ads, SP-API, then Keepa for 1 token), so a
  -- product with none isn't looked up again and again.
  add column if not exists image_checked_at timestamptz;
create index if not exists purchases_stock_item on purchases (stock_item_id);
