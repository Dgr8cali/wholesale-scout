-- Gate 4 reviews sent by the extension from amazon.co.uk's review pages: kept structured (stars,
-- date, title, body, variant, helpful votes) beside the dump's text, which is rendered from them
-- (1–3★) in Amazon's layout. A paste kept when captured reviews were added to it stays separately.

alter table pl_review_dumps add column if not exists captured jsonb;
alter table pl_review_dumps add column if not exists captured_at timestamptz;
alter table pl_review_dumps add column if not exists manual_text text;
