/**
 * Doubtful-match check for an EAN that resolves to several ASINs: is this listing
 * clearly a different product from the sheet line? Conservative on purpose — it needs
 * a clear brand clash or a title with nothing in common, not just different wording.
 */

const STOP = new Set([
  "and", "for", "the", "with", "des", "les", "pour", "avec", "per", "von", "und", "del", "con", "por",
  "pack", "packs", "pcs", "piece", "pieces", "ml", "mls", "oz", "fl", "ltr", "litre", "liter", "count",
]);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Words of 3+ letters, accents folded, sizes and filler removed. */
export function words(s: string | null | undefined): string[] {
  return fold(s ?? "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d/.test(w) && !STOP.has(w));
}

/** Same word, or the same first five letters when both are that long ("concentre" ~ "concentrated"). */
const same = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

const squash = (s: string | null | undefined) => fold(s ?? "").replace(/[^a-z0-9]/g, "");

export function brandsAgree(sheetBrand: string, amazonBrand: string): boolean {
  const a = squash(sheetBrand), b = squash(amazonBrand);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

export interface Listing {
  brand: string | null | undefined;
  title: string | null | undefined;
}

/** A reason this listing looks like a different product, or null when it plausibly matches. */
export function doubtfulMatch(sheet: Listing, amazon: Listing): string | null {
  const sheetBrand = sheet.brand?.trim();
  const amazonTitleWords = words(amazon.title);

  if (sheetBrand && amazon.brand?.trim() && !brandsAgree(sheetBrand, amazon.brand)) {
    const brandWords = words(sheetBrand).filter((w) => w.length >= 4);
    const titleNamesBrand = squash(amazon.title).includes(squash(sheetBrand)) ||
      brandWords.some((b) => amazonTitleWords.some((t) => same(b, t)));
    if (!titleNamesBrand) return `Amazon lists this as ${amazon.brand}, the sheet says ${sheetBrand}`;
  }

  const brandWords = new Set(words(sheetBrand));
  const sheetWords = words(sheet.title).filter((w) => !brandWords.has(w));
  const amazonWords = amazonTitleWords.filter((w) => !brandWords.has(w));
  if (sheetWords.length >= 2 && amazonWords.length >= 2 && !sheetWords.some((w) => amazonWords.some((t) => same(w, t)))) {
    return `Amazon's title "${amazon.title}" shares nothing with the sheet's "${sheet.title}"`;
  }
  return null;
}
