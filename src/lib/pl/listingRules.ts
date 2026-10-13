/**
 * Listing Writer, the first-draft rules: what the candidate tells the model (brand, key specs,
 * suitable for / not for, claims to avoid), the fixes made in code after every call (brand-first
 * Title Case title, capitalised bullet headers, backend terms cleaned and filled to the byte
 * budget), the Checks list each draft is held to, and the "needs proof" sentences. Pure.
 */
import { BACKEND_BYTES, bytes, cleanBackend, promoIn, type ListingDraft } from "./listing";
import { singular } from "./reviews";

/** What the seller says about the product, per candidate (the Listing section's inputs). */
export interface ListingFacts {
  brand: string;
  /** One fact per line. */
  specs: string[];
  suitableFor: string[];
  notFor: string[];
  /** Never stated, on top of the compliance list. */
  avoid: string[];
  packSize: string | null;
}

/** Everything a draft is checked against. */
export interface RuleContext extends ListingFacts {
  titleLimit: number;
  leadTerm: string | null;
  /** The theme picked in Gate 4 ("Use for Gate 4"), as worded in the reviews. */
  chosenTheme: string | null;
  /** Gate 4's themes left after ignore / not fixable, with their share of negative reviews. */
  themes: { theme: string; pct: number }[];
  /** The product's own words ("glasses wipes"): not what a complaint is about. */
  product: string;
  brands: string[];
  searchTerms: { term: string; volume: number | null }[];
  bankTerms: string[];
}

/** The rule context from the Listing step's inputs (the server's ListingInputs, or the editor's copy of them). */
export function ruleContext(i: ListingFacts & Omit<RuleContext, keyof ListingFacts | "themes"> & { themes: { theme: string; pct: number }[] }): RuleContext {
  return {
    brand: i.brand, specs: i.specs, suitableFor: i.suitableFor, notFor: i.notFor, avoid: i.avoid, packSize: i.packSize,
    titleLimit: i.titleLimit, leadTerm: i.leadTerm, chosenTheme: i.chosenTheme, themes: i.themes.map((t) => ({ theme: t.theme, pct: t.pct })), product: i.product,
    brands: i.brands, searchTerms: i.searchTerms, bankTerms: i.bankTerms,
  };
}

export const TITLE_TARGET = { min: 120, max: 180 } as const;
export const BULLET_TARGET = { min: 150, max: 250 } as const;
export const BACKEND_TARGET = 200;
/** A theme with at least this share of negative reviews must be answered (when it's a real complaint). */
export const THEME_MIN_PCT = 4;

/** Filler the backend terms don't need: Amazon ignores them. */
export const BACKEND_FILLER = ["of", "and", "for", "the", "with", "pack", "a", "an", "to", "in", "on", "by", "or", "is", "it", "your", "you", "our", "from", "at", "as"];
/** Health and body words: kept out of the backend terms unless the product is suitable for them. */
export const HEALTH_WORDS = ["eye", "eyes", "skin", "medical", "medicinal", "clinical", "germ", "germs", "bacteria", "virus", "viruses", "infection"];

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim().split(" ").filter(Boolean);
/** Singular and plural as one word: wipe/wipes, box/boxes, battery/batteries, lens/lenses (Gate 4's singular()). */
export const sameWord = (a: string, b: string) => a === b || singular(a) === singular(b);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The phrase's words in order (plurals allowed). */
export function hasPhrase(text: string, phrase: string): boolean {
  const tw = words(text), pw = words(phrase);
  if (!pw.length) return false;
  for (let i = 0; i + pw.length <= tw.length; i++) if (pw.every((p, j) => sameWord(tw[i + j], p))) return true;
  return false;
}

/** "a, b and c" or one per line → ["a", "b", "c"]. */
export function parseList(s: string | null | undefined): string[] {
  return (s ?? "").split(/[,;\n]|\s+and\s+|\s*&\s*/i).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean);
}
/** Key specs: one per line (semicolons split too). */
export function parseSpecs(s: string | null | undefined): string[] {
  return (s ?? "").split(/[\n;]/).map((x) => x.trim().replace(/^[-•*]\s*/, "").replace(/\.$/, "")).filter(Boolean);
}

/** The product comes individually wrapped (a spec or the pack size says so). */
export const individuallyWrapped = (f: Pick<ListingFacts, "specs" | "packSize">) => [...f.specs, f.packSize ?? ""].some((s) => /individually\s+wrapped|individually\s+sealed/i.test(s));

/* ===================== title ===================== */

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "per", "the", "to", "with", "x", "×", "vs"]);
const UNITS = /^(cm|mm|m|ml|l|g|kg|oz|in)$/i;
/** Title Case: small words lower (not first), units and numbers as written, short acronyms kept, ALL CAPS words softened. */
export function titleCase(s: string): string {
  let i = 0;
  return s.split(/(\s+)/).map((tok) => {
    if (!tok.trim()) return tok;
    const first = i++ === 0;
    if (/\d/.test(tok)) return tok;
    if (UNITS.test(tok.replace(/[,.;:)]+$/, ""))) return tok.toLowerCase();
    if (/^[A-Z]{2,3}[,.;:]?$/.test(tok)) return tok;
    const lower = tok.toLowerCase();
    if (!first && SMALL.has(lower.replace(/[^\p{L}×]/gu, ""))) return lower;
    return lower.replace(/(^|[-/(“"'‘])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
  }).join("");
}

/** The brand first, exactly as written, and nowhere else in the title. */
export function brandFirst(title: string, brand: string): string {
  const b = brand.trim();
  if (!b) return title.trim();
  // "… by Dewlens, 200 …" loses "by Dewlens" too, and the punctuation is tidied after.
  const rest = title.replace(new RegExp(`(^|[\\s,–—-])(?:by\\s+)?${escape(b)}(?=[\\s,–—-]|$)`, "giu"), "$1")
    .replace(/\s+,/g, ",").replace(/,(\s*,)+/g, ",").replace(/\s{2,}/g, " ").replace(/^[\s,–—-]+/, "").replace(/[\s,–—-]+$/, "").trim();
  return `${b} ${rest}`.trim();
}

/** Cut at a word to the limit, without a dangling comma or joining word. */
export function fitTitle(title: string, limit: number): string {
  if (title.length <= limit) return title;
  let t = title.slice(0, limit + 1).replace(/\s+\S*$/, "");
  for (let k = 0; k < 4; k++) t = t.replace(/[\s,;:–—-]+$/, "").replace(/\s+(and|for|with|of|the|to|in|&)$/i, "");
  return t;
}

/* ===================== bullets ===================== */

/** "Stays moist: …" → "STAYS MOIST: …"; a dash after the header becomes a colon. Headers of 2–4 words only. */
export function bulletHeader(b: string): string {
  const m = b.trim().match(/^([^:—–\n]{3,45}?)\s*(?::|—|–|\s-\s)\s*([\s\S]*)$/);
  if (!m) return b.trim();
  const n = m[1].trim().split(/\s+/).length;
  if (n < 2 || n > 4) return b.trim();
  return `${m[1].trim().toUpperCase()}: ${m[2].trim()}`;
}
const HEADER = /^[A-Z0-9][A-Z0-9'’&/+%×,-]*(\s+[A-Z0-9'’&/+%×,-]+){1,3}:\s/;

/* ===================== themes ===================== */

/** Words a reply to each complaint uses (a complaint's word → what answers it). */
const ANSWERS: Record<string, string[]> = {
  dry: ["dry", "dries", "drying", "moist", "moistened", "sealed", "saturated", "wet"],
  wet: ["wet", "soggy", "drip", "dripping", "quick-drying", "drying", "dries", "evaporates", "moist"],
  streak: ["streak", "streaks", "smear", "smears", "smudge", "residue", "haze", "clear"],
  smear: ["smear", "smears", "streak", "streaks", "residue", "haze", "clear"],
  small: ["size", "small", "large", "larger", "big", "cm", "mm", "generous"],
  tiny: ["size", "large", "larger", "cm", "mm", "generous"],
  big: ["size", "compact", "small", "cm", "mm"],
  thin: ["thick", "thicker", "durable", "strong", "gsm"],
  flimsy: ["sturdy", "durable", "strong", "thick", "robust"],
  tear: ["tear", "tears", "strong", "durable", "thick"],
  clean: ["clean", "cleans", "cleaning", "grime", "smudges", "fingerprints", "dirt"],
  breaks: ["sturdy", "durable", "strong", "break", "breaks", "robust", "reinforced"],
  leaks: ["leak", "leaks", "sealed", "seal", "leak-proof"],
  smells: ["smell", "smells", "odour", "scent", "fragrance", "unscented"],
  lint: ["lint", "fibres", "fluff"],
  scratch: ["scratch", "scratches", "scratching", "soft", "gentle"],
  sticky: ["sticky", "residue", "tacky"],
  stopped: ["working", "works", "reliable", "lasts"],
  working: ["working", "works", "reliable"],
};
/** Words in a theme that say what went wrong (the product's own words and filler don't). */
const NOT_CORE = new Set(["not", "no", "too", "very", "so", "doesn't", "didn't", "don't", "won't", "isn't", "can't", "never", "leave", "leaves", "left", "make", "makes", "get", "gets", "keep", "keeps", "use", "used", "really", "quite", "bit"]);
const EVALUATIVE = new Set(["good", "great", "bad", "worth", "happy", "recommend", "impressed", "nice", "ok", "okay", "value", "money", "buy", "like", "best", "worst", "terrible", "awful", "poor", "disappointed", "disappointing", "quality", "product", "item"]);
const COMPLAINT = /^(dr(y|ies|ied)|wet|soggy|streak|smear|smudg|residue|small|tiny|big|large|thin|flimsy|tear|rip|break|broke|crack|leak|smell|odour|stink|sticky|lint|fluff|scratch|greasy|oily|damag|missing|short|hard|sting|burn|irritat|stopp|fell|fall|loose|cheap)/;

const coreWords = (theme: string, product: string) => {
  const pw = words(product);
  return words(theme).filter((w) => !NOT_CORE.has(w) && !pw.some((p) => sameWord(p, w)) && w.length > 2);
};

/** A complaint a bullet can answer ("too dry", "leaves streaks", "not clean"), not praise or a vague grumble ("not good", "clean glasses"). */
export function isComplaint(theme: string, product = ""): boolean {
  const ws = words(theme);
  if (ws.some((w) => COMPLAINT.test(w))) return true;
  // "not clean", "doesn't work": a negation before what it failed at.
  const neg = ws.findIndex((w) => ["not", "no", "doesn't", "didn't", "won't", "never"].includes(w));
  if (neg >= 0) return coreWords(ws.slice(neg + 1).join(" "), product).some((w) => !EVALUATIVE.has(w));
  return false;
}

/** The themes the bullets must answer: the one picked, and every real complaint at ≥ 4% of negative reviews. */
export function requiredThemes(c: Pick<RuleContext, "themes" | "chosenTheme" | "product">): string[] {
  const out = c.chosenTheme ? [c.chosenTheme] : [];
  for (const t of c.themes) if (t.pct >= THEME_MIN_PCT && isComplaint(t.theme, c.product) && !out.includes(t.theme)) out.push(t.theme);
  return out;
}

/** The text answers the complaint: each word of what went wrong (or a word that answers it) is there. */
export function answersTheme(text: string, theme: string, product = ""): boolean {
  const core = coreWords(theme, product);
  if (!core.length) return words(text).length > 0;
  const tw = words(text.replace(/-/g, " ")).concat(words(text));
  return core.every((w) => {
    const key = Object.keys(ANSWERS).find((k) => sameWord(k, w) || w.startsWith(k));
    const vocab = [w, ...(key ? ANSWERS[key] : [])];
    return vocab.some((v) => tw.some((x) => sameWord(x, v) || (v.length > 4 && x.startsWith(v.slice(0, v.length - 2)))));
  });
}

/* ===================== specs ===================== */

const SPEC_FILLER = new Set(["with", "and", "the", "for", "per", "each", "size", "made", "from"]);
/** A key spec is in the text: all its numbers, or most of its words when it has none. */
export function specIn(text: string, spec: string): boolean {
  const nums = spec.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const tn: string[] = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (nums.length) return nums.every((n) => tn.includes(n));
  const sw = words(spec).filter((w) => w.length > 3 && !SPEC_FILLER.has(w));
  if (!sw.length) return true;
  const tw = words(text.replace(/-/g, " ")).concat(words(text));
  const hit = sw.filter((w) => tw.some((x) => sameWord(x, w) || x.startsWith(w.slice(0, Math.max(3, w.length - 3))))).length;
  return hit / sw.length >= 0.6;
}

/* ===================== backend ===================== */

/**
 * Backend terms: lowercase, ≤ 249 bytes, nothing in the title (plurals too), no filler, no
 * competitor brands or ASINs, no health/body words unless the product is suitable for them, no
 * "not for" words or claims to avoid; then filled toward the budget from the search terms, the
 * keyword bank and the uses, preferring words the bullets don't already carry.
 */
export function buildBackend(raw: string, d: Pick<ListingDraft, "title" | "bullets">, c: Pick<RuleContext, "brands" | "suitableFor" | "notFor" | "avoid" | "searchTerms" | "bankTerms" | "brand">): { text: string; added: string[] } {
  const allowed = new Set(c.suitableFor.flatMap(words));
  const banned = new Set([
    ...BACKEND_FILLER,
    ...HEALTH_WORDS.filter((w) => ![...allowed].some((a) => sameWord(a, w))),
    ...c.notFor.flatMap(words).filter((w) => ![...allowed].some((a) => sameWord(a, w))),
    ...c.avoid.flatMap(words),
    ...words(c.brand),
  ]);
  const titleWords = words(d.title);
  const ok = (w: string) => w.length > 1 && !/^\d+%?$/.test(w) && ![...banned].some((b) => sameWord(b, w)) && !titleWords.some((t) => sameWord(t, w));
  const base = cleanBackend(words(raw).filter(ok).join(" "), d.title, c.brands).text;
  const have = new Set(words(base));
  const bulletWords = words(d.bullets.join(" "));
  const pool = [...[...c.searchTerms].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).map((t) => t.term), ...c.bankTerms, ...c.suitableFor].flatMap(words);
  // Words the bullets don't carry first, then the rest.
  const ordered = [...pool.filter((w) => !bulletWords.some((b) => sameWord(b, w))), ...pool.filter((w) => bulletWords.some((b) => sameWord(b, w)))];
  const added: string[] = [];
  let text = base;
  for (const w of ordered) {
    if (bytes(text) >= BACKEND_TARGET + 30) break;
    if (!ok(w) || [...have].some((h) => sameWord(h, w)) || /^b0[a-z0-9]{8}$/i.test(w)) continue;
    const brand = c.brands.some((b) => words(b).length === 1 && sameWord(words(b)[0], w));
    if (brand) continue;
    const next = text ? `${text} ${w}` : w;
    if (bytes(next) > BACKEND_BYTES) continue;
    text = next; have.add(w); added.push(w);
  }
  return { text, added };
}

/* ===================== enforce ===================== */

/** The fixes made in code after a model call (what can be fixed without rewriting). */
export function enforceRules(d: ListingDraft, c: RuleContext): { draft: ListingDraft; fixes: string[] } {
  const fixes: string[] = [];
  let title = d.title.trim();
  for (const p of promoIn(title)) { title = title.replace(new RegExp(`(?<![\\p{L}\\p{N}-])${escape(p)}(?![\\p{L}\\p{N}-])`, "giu"), "").replace(/\s{2,}/g, " ").trim(); fixes.push(`"${p}" taken out of the title`); }
  const cased = titleCase(title);
  if (cased !== title) fixes.push("Title in Title Case");
  title = cased;
  if (c.brand.trim() && !title.startsWith(`${c.brand.trim()} `)) { title = brandFirst(title, c.brand); fixes.push(`Title starts with ${c.brand.trim()}`); }
  const fitted = fitTitle(title, c.titleLimit);
  if (fitted !== title) fixes.push(`Title cut to ${c.titleLimit} characters`);
  title = fitted;
  const bullets = d.bullets.map((b) => bulletHeader(b));
  if (bullets.some((b, i) => b !== d.bullets[i].trim())) fixes.push("Bullet headers in capitals");
  const before = d.backend;
  const backend = buildBackend(d.backend, { title, bullets }, c);
  if (backend.text !== before.trim()) fixes.push(`Backend terms cleaned${backend.added.length ? ` and ${backend.added.length} search words added` : ""} (${bytes(backend.text)} bytes)`);
  return { draft: { ...d, title, bullets, backend: backend.text }, fixes };
}

/* ===================== checks ===================== */

export interface ListingCheck { id: string; label: string; pass: boolean; detail?: string }

/** Every first-draft rule, passed or failed, in the order the Listing section shows them. */
export function listingChecks(d: ListingDraft, c: RuleContext, complianceTerms: string[] = []): ListingCheck[] {
  const out: ListingCheck[] = [];
  const add = (id: string, label: string, pass: boolean, detail?: string) => out.push({ id, label, pass, ...(detail && !pass ? { detail } : {}) });
  const brand = c.brand.trim();
  const t = d.title;
  add("brand_first", "Title starts with the brand", !!brand && t.startsWith(`${brand} `), brand ? `It should start with "${brand}"` : "No brand name set");
  if (c.leadTerm) {
    const afterBrand = brand && t.startsWith(brand) ? t.slice(brand.length) : t;
    add("lead_term", `Then the top search term ("${c.leadTerm}")`, hasPhrase(afterBrand.split(/\s+/).slice(0, words(c.leadTerm).length + 3).join(" "), c.leadTerm), `"${c.leadTerm}" should come straight after the brand`);
  }
  const packNum = c.packSize?.match(/\d+/)?.[0];
  if (packNum) add("pack_size", `Title has the pack size (${c.packSize})`, (t.match(/\d+/g) ?? ([] as string[])).includes(packNum), `Add "${c.packSize}"`);
  if (individuallyWrapped(c)) add("wrapped", "Title says Individually Wrapped", /individually wrapped/i.test(t), "Add \"Individually Wrapped\"");
  const uses = c.suitableFor.slice(0, 3);
  if (uses.length) {
    const missing = uses.filter((u) => !hasPhrase(t, u));
    add("uses", `Title names the top uses (${uses.join(", ")})`, !missing.length, `Missing: ${missing.join(", ")}`);
  }
  const first80 = t.slice(0, 80);
  const key = [brand, c.leadTerm, packNum].filter(Boolean) as string[];
  const late = key.filter((k) => !(k === packNum ? (first80.match(/\d+/g) ?? ([] as string[])).includes(k) : hasPhrase(first80, k) || first80.includes(k)));
  add("first_80", "Brand, top term and pack size in the first 80 characters", !late.length, `After character 80: ${late.join(", ")}`);
  const hi = Math.min(TITLE_TARGET.max, c.titleLimit), lo = Math.min(TITLE_TARGET.min, Math.round(c.titleLimit * 0.6));
  add("title_length", `Title ${lo}–${hi} characters`, t.length >= lo && t.length <= hi, `${t.length} characters`);
  const caps = (t.match(/\b[A-Z]{4,}\b/g) ?? []), promo = promoIn(t);
  const lowerWords = t.split(/\s+/).filter((w, i) => i > 0 && /^\p{Ll}/u.test(w) && !SMALL.has(w.replace(/[^\p{L}×]/gu, "")) && !UNITS.test(w.replace(/[,.;:)]+$/, "")));
  add("title_style", "Title Case, no ALL CAPS, no promo words", !caps.length && !promo.length && !lowerWords.length, [caps.length && `ALL CAPS: ${caps.join(", ")}`, promo.length && `promo: ${promo.join(", ")}`, lowerWords.length && `not capitalised: ${lowerWords.slice(0, 4).join(", ")}`].filter(Boolean).join("; "));

  const badHead = d.bullets.map((b, i) => (HEADER.test(b.trim()) ? null : i + 1)).filter((x) => x != null);
  add("bullet_headers", "Every bullet opens with a 2–4 word CAPITALISED header and a colon", d.bullets.length === 5 && !badHead.length, `Bullet ${badHead.join(", ")}`);
  const badLen = d.bullets.map((b, i) => (b.length >= BULLET_TARGET.min && b.length <= BULLET_TARGET.max ? null : `${i + 1} (${b.length})`)).filter(Boolean);
  add("bullet_length", `Each bullet ${BULLET_TARGET.min}–${BULLET_TARGET.max} characters`, !badLen.length, `Bullet ${badLen.join(", ")}`);
  if (c.chosenTheme) add("bullet1_theme", `Bullet 1 answers Gate 4's pick ("${c.chosenTheme}")`, answersTheme(d.bullets[0] ?? "", c.chosenTheme, c.product), "Lead with the fix for the complaint Gate 4 picked");
  const need = requiredThemes(c);
  if (need.length) {
    const unanswered = need.filter((th) => !d.bullets.some((b) => answersTheme(b, th, c.product)));
    add("themes", `Bullets answer every Gate 4 complaint (${need.length})`, !unanswered.length, `Not answered: ${unanswered.join(", ")}`);
  }
  if (c.specs.length) {
    const want = Math.min(3, c.specs.length);
    add("specs_bullet", "A bullet lists the key specs", d.bullets.some((b) => c.specs.filter((s) => specIn(b, s)).length >= want), `No bullet has ${want} of the key specs`);
  }
  if (c.suitableFor.length || c.notFor.length) {
    const ok = d.bullets.some((b) => (!c.suitableFor.length || c.suitableFor.filter((u) => hasPhrase(b, u)).length >= Math.min(2, c.suitableFor.length)) && (!c.notFor.length || c.notFor.some((n) => hasPhrase(b, n))));
    add("suitable_bullet", "A bullet says what it's suitable for and not for", ok, "One bullet should name the uses and the Not for list");
  }
  const paras = d.description.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  add("description_paragraphs", "Description in 3 short paragraphs", paras.length === 3, `${paras.length} paragraph${paras.length === 1 ? "" : "s"}`);
  if (c.specs.length) {
    const missing = c.specs.filter((s) => !specIn(d.description, s));
    add("description_specs", "Description has every key spec", !missing.length, `Missing: ${missing.join("; ")}`);
  }
  const b = bytes(d.backend);
  add("backend_bytes", `Backend terms ${BACKEND_TARGET}–${BACKEND_BYTES} bytes`, b >= BACKEND_TARGET && b <= BACKEND_BYTES, `${b} bytes`);
  const cleaned = buildBackend(d.backend, d, { ...c, searchTerms: [], bankTerms: [], suitableFor: c.suitableFor }).text;
  const extra = words(d.backend).filter((w) => !words(cleaned).includes(w));
  add("backend_words", "Backend: no title words, filler, brands, ASINs or health words", !extra.length && d.backend === d.backend.toLowerCase(), extra.length ? `Remove: ${[...new Set(extra)].slice(0, 8).join(", ")}` : "Lowercase only");
  add("claims", "No claims to avoid or compliance flags", !complianceTerms.length, [...new Set(complianceTerms)].join(", "));
  return out;
}

/* ===================== needs proof ===================== */

/** Promises about how the product performs: fine to say, once samples show they're true. */
const PROOF = /streak[- ]?free|no streaks?|without (?:streaks|smears|residue)|smear[- ]?free|lint[- ]?free|residue[- ]?free|no residue|stays? moist|won[’']?t dry out|never dr(?:y|ies) out|doesn[’']?t dry out|quick[- ]?drying|dries (?:quickly|fast|in seconds)|in seconds|instantly|safe (?:on|for)|won[’']?t scratch|scratch[- ]?free|fog[- ]?free|long[- ]?lasting|lasts? (?:for |up to )?\d|removes? (?:all|every|99)|\d+[- ]?year shelf life|gentle on|leaves? (?:a )?(?:crystal[- ])?clear/i;

export interface ProofFlag { field: "title" | "bullets" | "description" | "differentiation"; index?: number; sentence: string; phrase: string }

/** Each sentence that promises performance, with the phrase that does. */
export function needsProof(d: ListingDraft): ProofFlag[] {
  const out: ProofFlag[] = [];
  const scan = (field: ProofFlag["field"], text: string, index?: number) => {
    for (const s of text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
      const m = s.match(PROOF);
      if (m) out.push({ field, ...(index != null ? { index } : {}), sentence: s, phrase: m[0] });
    }
  };
  scan("title", d.title);
  d.bullets.forEach((b, i) => scan("bullets", b, i));
  scan("description", d.description);
  scan("differentiation", d.differentiation);
  return out;
}

/** The rules as the prompt states them (the same ones enforceRules and listingChecks hold the draft to). */
export function rulesPrompt(c: RuleContext): string {
  const need = requiredThemes(c);
  const wrapped = individuallyWrapped(c);
  return [
    `Title: start with the brand "${c.brand}", then "${c.leadTerm ?? c.product}"; include the pack size${c.packSize ? ` (${c.packSize})` : ""}${wrapped ? " and \"Individually Wrapped\"" : ""}; name the top uses (${c.suitableFor.slice(0, 3).join(", ") || "from Suitable for"}); the brand, the top term and the pack size within the first 80 characters; ${TITLE_TARGET.min}–${Math.min(TITLE_TARGET.max, c.titleLimit)} characters (never over ${c.titleLimit}); Title Case; no ALL CAPS words; no promo words (best, #1, free, sale, guaranteed).`,
    `Bullets: exactly five, each ${BULLET_TARGET.min}–${BULLET_TARGET.max} characters, each starting with a 2–4 word CAPITALISED header and a colon ("STAYS MOIST: …").${c.chosenTheme ? ` Bullet 1 answers "${c.chosenTheme}".` : ""}${need.length ? ` Between them the bullets must answer every one of these review complaints, using the key specs as the evidence: ${need.map((t) => `"${t}"`).join(", ")}.` : ""} One bullet lists the key specs. One bullet states what it's suitable for and what it's not for.`,
    `Description: three short paragraphs separated by a blank line, mentioning every key spec once.`,
    `Backend terms: lowercase, single spaces, ${BACKEND_TARGET}–${BACKEND_BYTES} bytes; no words already in the title (plurals count), no filler (of, and, for, the, with, pack, a, to, in), no competitor brands, no ASINs, no health or body words (eye, eyes, skin, medical) unless in Suitable for; add synonyms and use-case words not in the title or bullets.`,
    `Never state any of these claims: ${[...c.avoid, "antibacterial", "kills 99.9%", "disinfects", "sterile", "medical grade", "FDA", "cures"].join(", ")}.`,
  ].join("\n");
}
