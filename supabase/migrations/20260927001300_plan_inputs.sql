-- Order planner inputs on the brand map (each product on the default profile): what a unit
-- brings in before its landed cost (so any supplier's offer can be costed), your share of sales
-- a month, which gates warned, and the chosen Qogita offer (seller, case size, MOV) for the cart.
-- Safe to re-run.

alter table brand_products
  add column if not exists proceeds    numeric(10,2),   -- profit at a landed cost of 0: profit = proceeds − landed
  add column if not exists share_month numeric(10,2),
  add column if not exists warn_gates  text[] not null default '{}',
  add column if not exists qogita      jsonb;           -- { fid, qid, seller, unit, inventory, priceGbp, movGbp }
