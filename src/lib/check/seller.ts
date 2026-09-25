/** A pasted Amazon seller ID or storefront link → the seller ID. Pure, for the page and the server. */

const SELLER_ID = /^A[0-9A-Z]{8,20}$/;

/**
 * "A30PLPOC3L6XYK", or a storefront / seller-profile link:
 * amazon.co.uk/sp?seller=ID, /s?me=ID, /shops/ID, …&seller=ID. Null when there isn't one.
 */
export function sellerIdFrom(input: string): string | null {
  const s = input.trim();
  if (SELLER_ID.test(s.toUpperCase())) return s.toUpperCase();
  const m = s.match(/[?&](?:seller|me|merchant|smid)=([A-Z0-9]{9,21})(?=$|[&#\s])/i) ?? s.match(/\/shops\/([A-Z0-9]{9,21})(?=$|[/?#])/i);
  const id = m?.[1]?.toUpperCase();
  return id && SELLER_ID.test(id) ? id : null;
}

/** The storefront page on Amazon UK. */
export const storefrontUrl = (sellerId: string) => `https://www.amazon.co.uk/s?me=${sellerId}`;

/** Most ASINs a scan screens; the rest are counted, not screened. */
export const SCAN_CAP = 2000;
