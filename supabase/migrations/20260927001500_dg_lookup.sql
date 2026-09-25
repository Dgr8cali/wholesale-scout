-- Seller Central's Dangerous Goods lookup, imported from the file it returns. Safe to re-run.
alter table products
  -- { status: "not_dg" | "dg_fulfillable" | "dg_not_fulfillable" | "review_required" | "unknown",
  --   text (Amazon's words), programme, at, file }
  add column if not exists dg_lookup jsonb;
