/**
 * IP-risk brands: brands known to file IP or counterfeit complaints against resellers. Matched
 * on the product's brand (never title words), case- and punctuation-insensitive, with aliases.
 */
import { brandKey } from "./brands";

export const IP_LEVELS = ["low", "medium", "high"] as const;
export type IpLevel = (typeof IP_LEVELS)[number];

export interface IpRiskBrand {
  id?: string;
  brand: string;
  aliases: string[];
  level: IpLevel;
  note: string | null;
  /** Where it came from: "seed, unverified", a community list, your own experience. */
  source: string | null;
  /** When it was reported or checked, YYYY-MM-DD. */
  reported_on: string | null;
}

/** What a match says: "IP risk (high): <note>". */
export interface IpRiskMatch {
  brand: string;
  level: IpLevel;
  note: string | null;
  source: string | null;
}

export type IpIndex = Map<string, IpRiskMatch>;

/** Every key a brand is known by (its name and aliases) → the entry. */
export function ipIndex(list: IpRiskBrand[]): IpIndex {
  const out: IpIndex = new Map();
  for (const e of list) {
    const m = { brand: e.brand, level: e.level, note: e.note, source: e.source };
    for (const name of [e.brand, ...(e.aliases ?? [])]) {
      const k = brandKey(name);
      if (k && !out.has(k)) out.set(k, m);
    }
  }
  return out;
}

/** The IP-risk entry for a product's brand(s), if any. */
export function matchIpRisk(index: IpIndex | null | undefined, ...brands: (string | null | undefined)[]): IpRiskMatch | null {
  if (!index?.size) return null;
  for (const b of brands) {
    const m = index.get(brandKey(b));
    if (m) return m;
  }
  return null;
}

/** "IP risk (high): Files counterfeit complaints on Amazon UK". */
export const ipRiskText = (m: IpRiskMatch) => `IP risk (${m.level})${m.note ? `: ${m.note}` : ""}`;

const LEVEL_WORDS: Record<string, IpLevel> = {
  low: "low", l: "low", "1": "low", medium: "medium", med: "medium", m: "medium", "2": "medium", high: "high", h: "high", "3": "high",
};

/** One CSV line into cells: commas (or tabs), with double-quoted cells. */
function cells(line: string): string[] {
  const sep = line.includes("\t") && !line.includes(",") ? "\t" : ",";
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const COLUMNS = { brand: /^(brand|name)$/, level: /^(level|risk|risk level|severity)$/, note: /^(note|notes|reason|details?)$/, source: /^(source|from|list)$/, date: /^(date|reported|reported on|checked)$/, aliases: /^(aliases?|also known as|aka)$/ };

/**
 * A pasted list: a header row naming brand / level / note / source / date / aliases (any
 * order), or no header with those columns in that order, or just one brand per line. Aliases
 * are separated by ; or |. A missing level is medium.
 */
export function parseIpCsv(text: string, defaults: { source?: string } = {}): { rows: IpRiskBrand[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const rows: IpRiskBrand[] = [];
  const errors: string[] = [];
  if (!lines.length) return { rows, errors: ["Nothing to import"] };
  const head = cells(lines[0]).map((c) => c.toLowerCase());
  const named = head.some((h) => COLUMNS.brand.test(h));
  const col = (k: keyof typeof COLUMNS, fallback: number) => {
    if (!named) return fallback;
    const i = head.findIndex((h) => COLUMNS[k].test(h));
    return i;
  };
  const at = { brand: col("brand", 0), level: col("level", 1), note: col("note", 2), source: col("source", 3), date: col("date", 4), aliases: col("aliases", 5) };
  const seen = new Set<string>();
  lines.slice(named ? 1 : 0).forEach((line, i) => {
    const n = i + (named ? 2 : 1);
    const c = cells(line);
    const get = (k: keyof typeof at) => (at[k] >= 0 ? c[at[k]]?.trim() ?? "" : "");
    const brand = get("brand");
    if (!brand || !brandKey(brand)) return void errors.push(`line ${n}: no brand`);
    const lv = get("level").toLowerCase();
    const level = lv ? LEVEL_WORDS[lv] : "medium";
    if (!level) return void errors.push(`line ${n}: level "${get("level")}" isn't low, medium or high`);
    let date: string | null = get("date") || null;
    if (date) {
      const uk = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (uk) date = `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return void errors.push(`line ${n}: date "${get("date")}" isn't YYYY-MM-DD or DD/MM/YYYY`);
    }
    const key = brandKey(brand);
    if (seen.has(key)) return void errors.push(`line ${n}: ${brand} is already listed`);
    seen.add(key);
    rows.push({
      brand,
      level,
      note: get("note") || null,
      source: get("source") || defaults.source || null,
      reported_on: date,
      aliases: get("aliases").split(/[;|]/).map((a) => a.trim()).filter(Boolean),
    });
  });
  return { rows, errors };
}
