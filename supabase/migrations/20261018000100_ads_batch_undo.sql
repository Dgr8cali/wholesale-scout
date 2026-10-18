-- What writing a launch batch replaced here (the product's phase and the launch plan it
-- overwrote), so a batch that was never uploaded can be discarded without Amazon data.
alter table ads_export_batches add column if not exists undo jsonb;
