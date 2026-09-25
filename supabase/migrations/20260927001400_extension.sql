-- Chrome extension read-backs on a product: competitors' stock (read on Amazon, per click) and
-- Seller Central's dangerous-goods classification (confirmed by you on the page). Safe to re-run.

alter table products
  -- { at, sellers: [{ sellerId, name, fba, stock, limited }] }: limited = a per-customer cap, not stock.
  add column if not exists competitor_stock jsonb,
  -- { at, status: "hazmat" | "not_hazmat" | "unknown", detail, url }
  add column if not exists sc_dg jsonb;
