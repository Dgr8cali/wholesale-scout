/**
 * Reviews the extension captured on amazon.co.uk/product-reviews/<ASIN> pages ("Send reviews to
 * Private label"): checked and cleaned here, merged with what was captured before (by Amazon's review
 * id), and rendered into Gate 4's dump in Amazon's own layout, so the miner splits them exactly as
 * it does a paste. Gate 4 mines 1–3★ reviews: 4–5★ ones (and any whose stars weren't read) are kept
 * but left out of the dump. Pure.
 */

export interface CapturedReview {
  /** Amazon's review id (R…), else a key from its text. */
  id: string;
  stars: number | null;
  /** As Amazon shows it: "Reviewed in the United Kingdom on 2 September 2026". */
  date: string | null;
  title: string | null;
  body: string;
  /** "Colour: Blue | Size: Large". */
  variant: string | null;
  helpful: number | null;
  /** "Verified Purchase" shown, and the country it was reviewed in (0.5.2+). */
  verified?: boolean | null;
  country?: string | null;
}

/** At most this many kept per ASIN, and this much text each. */
export const CAPTURE_MAX = 2000;
const BODY_MAX = 5000;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const keyOf = (r: Pick<CapturedReview, "stars" | "title" | "body">) => `t:${r.stars ?? ""}|${(r.title ?? "").toLowerCase()}|${r.body.toLowerCase().slice(0, 120)}`;

/** The extension's reviews, checked: a body or a title each, stars 1–5 or none, ids kept. */
export function cleanCaptured(input: unknown): CapturedReview[] {
  if (!Array.isArray(input)) return [];
  const out: CapturedReview[] = [];
  for (const x of input.slice(0, CAPTURE_MAX)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const body = str(o.body, BODY_MAX) ?? "";
    const title = str(o.title, 300);
    if (!body && !title) continue;
    const s = Number(o.stars);
    const stars = Number.isFinite(s) && s >= 1 && s <= 5 ? Math.round(s) : null;
    const h = Number(o.helpful);
    const r = {
      stars, date: str(o.date, 120), title, body, variant: str(o.variant, 200), helpful: o.helpful != null && Number.isFinite(h) && h >= 0 ? Math.round(h) : null,
      verified: typeof o.verified === "boolean" ? o.verified : null, country: str(o.country, 60),
    };
    const id = typeof o.id === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(o.id) ? o.id : keyOf(r);
    out.push({ id, ...r });
  }
  return out;
}

/** What was captured before and now, one per review (a later capture of the same review wins). */
export function mergeCaptured(before: CapturedReview[], now: CapturedReview[]): { reviews: CapturedReview[]; added: number } {
  const byId = new Map(before.map((r) => [r.id, r]));
  let added = 0;
  for (const r of now) {
    if (!byId.has(r.id)) added++;
    byId.set(r.id, r);
  }
  return { reviews: [...byId.values()].slice(0, CAPTURE_MAX), added };
}

const VARIANT_LINE = /^(colou?r|size|style|pattern|design|configuration|pattern name|size name|colour name)\s*:/i;

/**
 * Gate 4's reviews: 1–3★. One whose stars weren't read stays out (kept, counted "?"): without its
 * star line the miner would run it into the review before.
 */
export const forGate4 = (r: CapturedReview) => r.stars != null && r.stars <= 3;

/**
 * The dump's text for captured reviews, in the layout the miner reads: "2.0 out of 5 stars <title>",
 * the "Reviewed in …" line, the variant, the body, the helpful votes (lines the miner skips as noise).
 */
export function renderCaptured(reviews: CapturedReview[]): string {
  return reviews.filter(forGate4).map((r) => [
    `${r.stars}.0 out of 5 stars ${r.title ?? ""}`.trim(),
    r.date ?? "",
    // Only a variant the miner knows to skip ("Colour: …", "Size: …"): any other would read as words of the review.
    r.variant && VARIANT_LINE.test(r.variant) ? r.variant : "",
    r.body,
    r.helpful ? `${r.helpful} ${r.helpful === 1 ? "person" : "people"} found this helpful` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

/** How many of each star rating ("?" when unknown). */
export function starCounts(reviews: CapturedReview[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reviews) { const k = r.stars == null ? "?" : String(r.stars); out[k] = (out[k] ?? 0) + 1; }
  return out;
}
