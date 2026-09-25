-- Re-screen support: each result keeps the data it was screened on (match, market data,
-- hazmat flags, gating status, Amazon's fee and the price it was quoted at, lookup trace),
-- so gates and score can be re-run with a new profile without calling Amazon or Keepa again.
alter table results add column if not exists inputs jsonb;
