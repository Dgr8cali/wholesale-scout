/**
 * "Check ASINs" input: one item per line — an ASIN, an EAN, or an Amazon URL — optionally
 * followed by a landed cost ("B0ABC12345, 4.73", "B0ABC12345 £4.73", tab-separated from a
 * sheet). Pure, so the page can preview what the server will read.
 */

export interface CheckLine {
  kind: "asin" | "ean";
  /** Upper-cased ASIN, or the EAN's digits. */
  code: string;
  /** Landed cost per unit, GBP; null when not given. */
  landedGbp: number | null;
  /** 1-based line number in the input. */
  line: number;
}

export interface ParsedCheck {
  lines: CheckLine[];
  /** Lines that couldn't be read: "line 3: no ASIN, EAN or Amazon link". */
  errors: string[];
}

export const MAX_CHECK_LINES = 500;

const ASIN = /^(?:B0[0-9A-Z]{8}|\d{9}[\dX])$/i;
// Amazon product links: /dp/X, /gp/product/X, /gp/aw/d/X, /product/X, ?asin=X
const URL_ASIN = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/|[?&]asin=)([A-Z0-9]{10})(?=$|[/?&#\s])/i;

/** The ASIN in an Amazon link, or null. */
export function asinFromUrl(s: string): string | null {
  const m = s.match(URL_ASIN);
  return m && ASIN.test(m[1]) ? m[1].toUpperCase() : null;
}

/** "£4.73", "4,73", "4.73 GBP" → 4.73; null when there's no usable number. */
function money(s: string): number | null {
  const t = s.replace(/£|gbp/gi, "").trim().replace(/^(\d+),(\d{1,2})$/, "$1.$2");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? Math.round(n * 10000) / 10000 : null;
}

export function parseCheckInput(text: string): ParsedCheck {
  const lines: CheckLine[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const s = raw.trim();
    if (!s || s.startsWith("#")) return;
    let code: string | null = null;
    let kind: CheckLine["kind"] = "asin";
    let rest = s;
    const url = s.match(/https?:\/\/\S+/i)?.[0];
    if (url) {
      code = asinFromUrl(url);
      rest = s.replace(url, " ");
      if (!code) return void errors.push(`line ${line}: no ASIN in that link`);
    } else {
      const first = s.match(/^[^\s,;|]+/)![0];
      rest = s.slice(first.length);
      if (ASIN.test(first) && !/^\d{8,14}$/.test(first)) code = first.toUpperCase();
      else if (/^\d{8,14}$/.test(first)) { code = first; kind = "ean"; }
      else return void errors.push(`line ${line}: "${first.slice(0, 30)}" isn't an ASIN, EAN or Amazon link`);
    }
    const costText = rest.replace(/^[\s,;|]+|[\s,;|]+$/g, "");
    let landedGbp: number | null = null;
    if (costText) {
      landedGbp = money(costText);
      if (landedGbp == null) return void errors.push(`line ${line}: "${costText.slice(0, 30)}" isn't a cost`);
    }
    const key = `${kind}:${code}`;
    if (seen.has(key)) return void errors.push(`line ${line}: ${code} is already listed`);
    seen.add(key);
    lines.push({ kind, code, landedGbp, line });
  });
  if (lines.length > MAX_CHECK_LINES) {
    errors.push(`${lines.length} items is over the ${MAX_CHECK_LINES} a check takes; upload a file instead`);
    lines.length = MAX_CHECK_LINES;
  }
  return { lines, errors };
}
