-- The part of each AI call's output tokens spent thinking (billed as output, never in the answer).
alter table ads_ai_calls add column if not exists thinking_tokens integer not null default 0;
