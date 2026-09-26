-- Cost override: an optional minimum order value for the supplier you named (the order
-- planner treats Set your cost offers as buyable; no MOV unless you set one). Safe to re-run.
alter table offers add column if not exists mov_gbp numeric(12,2);
