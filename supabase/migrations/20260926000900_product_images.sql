-- Main product image (Amazon's CDN link from the SP-API catalog, else Keepa). '' = looked, none.
alter table products add column if not exists image_url text;
