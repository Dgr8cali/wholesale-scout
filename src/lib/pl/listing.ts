/**
 * Listing Writer (Private label): the rules a listing is held to, the backend-terms clean-up, the
 * compliance scan with suggested rewrites, keyword coverage weighted by search volume, and the
 * Seller Central flat-file row. The model writes the draft (server/plListing.ts); everything here
 * checks it, the same way on the server and in the editor. Pure.
 */

export interface ListingDraft { title: string; bullets: string[]; description: string; backend: string; differentiation: string }
export const LISTING_FIELDS = ["title", "bullets", "description", "backend", "differentiation"] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

export const DEFAULT_TITLE_LIMIT = 200;
export const BACKEND_BYTES = 249;
/** The caps on what the model writes (the answer format says so; normaliseDraft enforces them). */
export const BULLET_LIMIT = 250;
export const DESCRIPTION_LIMIT = 1000;
export const DIFFERENTIATION_LIMIT = 400;
/** Backend terms come back as a list of single words, at most this many (joined, deduped and trimmed to 249 bytes in code). */
export const BACKEND_WORDS_MAX = 40;
export const DEFAULT_BRAND_VOICE = "premium, clean, simple, no hype";

/** Words Amazon's style rules don't allow in a listing: promotional claims. */
export const PROMO_WORDS = ["best", "#1", "number one", "free", "sale", "guaranteed", "guarantee", "cheapest", "top rated", "best seller", "bestseller"];

export const bytes = (s: string) => new TextEncoder().encode(s).length;
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
const sameWord = (a: string, b: string) => a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
const hasWord = (text: string, w: string) => words(text).some((x) => sameWord(x, w));
/** The phrase as words in order (plurals allowed). */
function hasPhrase(text: string, phrase: string): boolean {
  const tw = words(text), pw = words(phrase);
  if (!pw.length) return false;
  for (let i = 0; i + pw.length <= tw.length; i++) if (pw.every((p, j) => sameWord(tw[i + j], p))) return true;
  return false;
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ASIN = /\bB0[A-Z0-9]{8}\b/i;

/** Promotional words in the text: standalone only ("streak-free" and "BPA-free" describe, they don't promote). */
export function promoIn(text: string): string[] {
  return PROMO_WORDS.filter((w) => new RegExp(`(?<![\\p{L}\\p{N}-])${escape(w)}(?![\\p{L}\\p{N}-])`, "iu").test(text));
}

export interface Issue { field: ListingField | "bullet"; index?: number; level: "error" | "warn"; message: string }

/** The title, bullets and description against Amazon's style rules and the Gate 4 themes. */
export function ruleIssues(d: ListingDraft, o: { titleLimit: number; leadTerm?: string | null; themes?: string[] }): Issue[] {
  const out: Issue[] = [];
  if (!d.title.trim()) out.push({ field: "title", level: "error", message: "No title" });
  if (d.title.length > o.titleLimit) out.push({ field: "title", level: "error", message: `${d.title.length} characters: over ${o.titleLimit}` });
  if (o.leadTerm && !words(d.title).slice(0, Math.max(6, words(o.leadTerm).length + 3)).join(" ").includes(words(o.leadTerm).join(" ").replace(/s$/, ""))) {
    out.push({ field: "title", level: "warn", message: `Doesn't lead with "${o.leadTerm}", the highest-volume relevant term` });
  }
  const caps = (s: string) => (s.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => !/^(UK|USB|LED|BPA|SPF|XL|XXL|UV)$/.test(w));
  for (const [field, text] of [["title", d.title], ["description", d.description]] as const) {
    if (caps(text).length) out.push({ field, level: "error", message: `ALL CAPS: ${caps(text).slice(0, 3).join(", ")}` });
    const promo = promoIn(text);
    if (promo.length) out.push({ field, level: "error", message: `Promotional words: ${promo.join(", ")}` });
  }
  if (d.bullets.length !== 5) out.push({ field: "bullets", level: "error", message: `${d.bullets.length} bullets: five needed` });
  d.bullets.forEach((b, i) => {
    if (!b.trim()) { out.push({ field: "bullet", index: i, level: "error", message: "Empty" }); return; }
    if (b.length > BULLET_LIMIT) out.push({ field: "bullet", index: i, level: "error", message: `${b.length} characters: over ${BULLET_LIMIT}` });
    // Opens with a short capitalised benefit: "LEAK-PROOF LID —" or "Leak-proof lid:".
    if (!/^[A-Z][^.:—–]{2,40}(:|—|–| - )/.test(b.trim())) out.push({ field: "bullet", index: i, level: "warn", message: "Doesn't open with a short capitalised benefit (\"Leak-proof lid: …\")" });
    const promo = promoIn(b);
    if (promo.length) out.push({ field: "bullet", index: i, level: "error", message: `Promotional words: ${promo.join(", ")}` });
    if (caps(b.replace(/^[^:—–]+[:—–]/, "")).length) out.push({ field: "bullet", index: i, level: "warn", message: "ALL CAPS after the opening benefit" });
  });
  // Whether the bullets answer Gate 4's complaints is the Checks list's job (listingRules answersTheme): one logic, one place.
  if (d.description.length > DESCRIPTION_LIMIT) out.push({ field: "description", level: "error", message: `${d.description.length} characters: over ${DESCRIPTION_LIMIT}` });
  if (bytes(d.backend) > BACKEND_BYTES) out.push({ field: "backend", level: "error", message: `${bytes(d.backend)} bytes: over ${BACKEND_BYTES}` });
  return out;
}

/** A complaint theme ("lid breaks") is answered when its words show up (any order). */
export function themeIn(text: string, theme: string): boolean {
  const tw = words(theme).filter((w) => w.length > 2 && !["the", "and", "too", "not", "doesn", "isn", "very"].includes(w));
  return tw.length > 0 && tw.every((w) => hasWord(text, w) || words(text).some((x) => x.startsWith(w.slice(0, Math.max(4, w.length - 2)))));
}

/**
 * Backend search terms as Amazon wants them: lowercase, single spaces, each word once, none already
 * in the title, no competitor brands, no ASINs, at most 249 bytes (cut at a word).
 */
export function cleanBackend(raw: string, title: string, brands: string[]): { text: string; dropped: string[] } {
  const inTitle = new Set(words(title));
  const brandWords = brands.map((b) => words(b)).filter((w) => w.length);
  const seen = new Set<string>();
  const kept: string[] = [], dropped: string[] = [];
  const all = words(raw);
  for (let i = 0; i < all.length; i++) {
    const w = all[i];
    // A brand of one word, or a brand's words in a row.
    const brandHit = brandWords.find((bw) => bw.every((x, j) => all[i + j] === x));
    if (brandHit) { dropped.push(brandHit.join(" ")); i += brandHit.length - 1; continue; }
    if (ASIN.test(w)) { dropped.push(w); continue; }
    if ([...inTitle].some((t) => sameWord(t, w))) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    kept.push(w);
  }
  let text = "";
  for (const w of kept) {
    const next = text ? `${text} ${w}` : w;
    if (bytes(next) > BACKEND_BYTES) { dropped.push(w); continue; }
    text = next;
  }
  return { text, dropped };
}

export interface ComplianceFlag { field: ListingField; index?: number; term: string; why: string; suggestion: string }

/** Claims that need evidence or aren't allowed, with a rewrite to suggest. */
const CLAIMS: { re: RegExp; term: string; why: string; suggestion: string; certifiable?: boolean }[] = [
  { re: /\banti[- ]?bacterial\b/i, term: "antibacterial", why: "A biocidal claim: needs registration and evidence", suggestion: "\"cleans away dirt and grime\"" },
  { re: /\bkills?\s+99(\.9+)?\s*%/i, term: "kills 99.9%", why: "A biocidal efficacy claim", suggestion: "\"leaves surfaces visibly clean\"" },
  { re: /\bdisinfect(s|ing|ant)?\b/i, term: "disinfect", why: "A biocidal claim", suggestion: "\"cleans\" or \"freshens\"" },
  { re: /\bsterile|steriliz(e|es|ing|ed)|sterilis(e|es|ing|ed)\b/i, term: "sterile", why: "A medical-device claim", suggestion: "\"hygienically sealed\"" },
  { re: /\bmedical[- ]grade\b/i, term: "medical grade", why: "Implies a medical device", suggestion: "\"high-quality\" with the actual material" },
  { re: /\bFDA\b/, term: "FDA", why: "A US approval claim, not valid for the UK", suggestion: "remove it" },
  { re: /\bcures?\b|\bcured\b/i, term: "cure", why: "A medicinal claim", suggestion: "\"helps with\" plus what it physically does" },
  { re: /\beco[- ]?friendly\b/i, term: "eco-friendly", why: "A green claim needing evidence (CMA Green Claims Code)", suggestion: "the specific, provable fact (\"recyclable cardboard box\")", certifiable: true },
  { re: /\bbiodegradable\b/i, term: "biodegradable", why: "A green claim needing certification", suggestion: "remove, or name the certification", certifiable: true },
  { re: /\bplastic[- ]free\b/i, term: "plastic-free", why: "A green claim needing evidence", suggestion: "say what it's made of instead", certifiable: true },
];

/**
 * Every flagged claim and competitor brand in the draft, and the candidate's own claims to avoid
 * (always flagged). Green claims pass when the notes say certified, unless they're on that list.
 */
export function complianceFlags(d: ListingDraft, o: { brands: string[]; notes?: string | null; avoid?: string[] }): ComplianceFlag[] {
  const avoid = (o.avoid ?? []).map((a) => a.trim()).filter(Boolean);
  const avoidRe = avoid.map((a) => ({ term: a, re: new RegExp(`(?<![\\p{L}\\p{N}])${a.toLowerCase().split(/[\s-]+/).map(escape).join("[\\s-]?")}(?![\\p{L}\\p{N}])`, "iu") }));
  const certified = /certif(ied|icate|ication)/i.test(o.notes ?? "");
  const fields: { field: ListingField; index?: number; text: string }[] = [
    { field: "title", text: d.title }, ...d.bullets.map((b, i) => ({ field: "bullets" as const, index: i, text: b })),
    { field: "description", text: d.description }, { field: "backend", text: d.backend },
  ];
  const out: ComplianceFlag[] = [];
  for (const f of fields) {
    for (const c of CLAIMS) {
      const listed = avoidRe.some((a) => a.re.test(c.term));
      if (c.certifiable && certified && !listed) continue;
      if (c.re.test(f.text)) out.push({ field: f.field, index: f.index, term: c.term, why: c.why, suggestion: c.suggestion });
    }
    for (const a of avoidRe) {
      if (!a.re.test(f.text)) continue;
      if (out.some((x) => x.field === f.field && x.index === f.index && x.term.replace(/[\s-]/g, "").toLowerCase() === a.term.replace(/[\s-]/g, "").toLowerCase())) continue;
      out.push({ field: f.field, index: f.index, term: a.term, why: "On this candidate's Claims to avoid", suggestion: "remove it" });
    }
    for (const b of o.brands) {
      if (b.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(b.trim())}([^\\p{L}\\p{N}]|$)`, "iu").test(f.text)) {
        out.push({ field: f.field, index: f.index, term: b, why: "A competitor's brand", suggestion: "remove it (and from the backend terms)" });
      }
    }
  }
  return out;
}

export interface CoverageRow { term: string; volume: number | null; conversion: number | null; inTitle: boolean; inBullets: boolean; inBackend: boolean; covered: boolean }

/**
 * Each search term: is it in the title, the bullets, the backend terms (every word, any order, for
 * the backend). Coverage is the share of search volume the listing covers.
 */
export function keywordCoverage(d: ListingDraft, terms: { term: string; volume?: number | null; conversion?: number | null }[]): { rows: CoverageRow[]; pct: number | null } {
  const bulletsText = d.bullets.join(" ");
  const backendWords = new Set(words(`${d.title} ${d.backend}`));
  const rows = terms.map((t) => {
    const inTitle = hasPhrase(d.title, t.term), inBullets = hasPhrase(bulletsText, t.term);
    const inBackend = words(t.term).every((w) => [...backendWords].some((x) => sameWord(x, w)));
    return { term: t.term, volume: t.volume ?? null, conversion: t.conversion ?? null, inTitle, inBullets, inBackend, covered: inTitle || inBullets || inBackend };
  });
  const total = rows.reduce((a, r) => a + (r.volume ?? 0), 0);
  const covered = rows.reduce((a, r) => a + (r.covered ? r.volume ?? 0 : 0), 0);
  return { rows, pct: total > 0 ? Math.round((covered / total) * 1000) / 10 : rows.length ? Math.round((rows.filter((r) => r.covered).length / rows.length) * 1000) / 10 : null };
}

/** Seller Central's flat file: the header and the row, tab-separated. */
export function flatFileRow(d: ListingDraft): string {
  const cols = ["item_name", "bullet_point1", "bullet_point2", "bullet_point3", "bullet_point4", "bullet_point5", "product_description", "generic_keywords"];
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  const vals = [d.title, ...[0, 1, 2, 3, 4].map((i) => d.bullets[i] ?? ""), d.description, d.backend].map(clean);
  return `${cols.join("\t")}\n${vals.join("\t")}\n`;
}

/** Everything, as text to paste somewhere. */
export function copyAll(d: ListingDraft): string {
  return [`Title:\n${d.title}`, `Bullets:\n${d.bullets.map((b) => `• ${b}`).join("\n")}`, `Description:\n${d.description}`, `Backend search terms:\n${d.backend}`, `Differentiation:\n${d.differentiation}`].join("\n\n");
}

/** The highest-volume search term that's about the product (shares a word with the niche keyword or name). */
export function leadTerm(terms: { term: string; volume?: number | null }[], product: string): string | null {
  const pw = words(product);
  const relevant = terms.filter((t) => words(t.term).some((w) => pw.some((p) => sameWord(p, w) && p.length > 2)));
  const pool = relevant.length ? relevant : terms;
  return [...pool].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0]?.term ?? null;
}

/** At most `max` characters: cut after the last full sentence that fits, else at a word. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max + 1);
  const sentence = head.match(/^[\s\S]*[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length >= max * 0.6) return sentence.trim();
  return head.replace(/\s+\S*$/, "").replace(/[\s,;:–—-]+$/, "").trim();
}

/**
 * Backend terms as the model sends them (a list of single words, or a string from an older answer
 * or an edit): the first 40 words, one word each.
 */
export function backendWords(v: unknown): string {
  if (Array.isArray(v)) return v.filter((w): w is string => typeof w === "string").slice(0, BACKEND_WORDS_MAX).map((w) => w.trim().split(/\s+/)[0] ?? "").filter(Boolean).join(" ");
  return typeof v === "string" ? v.trim() : "";
}

/**
 * A draft as the model or an edit gives it: five bullets, strings everywhere, each field within its
 * cap (title to the limit, bullets 250, description 1,000, differentiation 400), the backend
 * cleaned. The model's answer format states the same caps.
 */
export function normaliseDraft(x: Partial<Omit<ListingDraft, "backend">> & { backend?: unknown } | null | undefined, brands: string[], titleLimit = DEFAULT_TITLE_LIMIT): ListingDraft {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const bullets = Array.isArray(x?.bullets) ? x!.bullets.map((b) => clip(s(b), BULLET_LIMIT)) : [];
  while (bullets.length < 5) bullets.push("");
  const title = clip(s(x?.title), titleLimit);
  return {
    title, bullets: bullets.slice(0, 5), description: clip(s(x?.description), DESCRIPTION_LIMIT),
    backend: cleanBackend(backendWords(x?.backend), title, brands).text, differentiation: clip(s(x?.differentiation), DIFFERENTIATION_LIMIT),
  };
}
