/**
 * Private label, Gate 4: mine pasted 1–3★ reviews for the complaint that repeats. Local, no API:
 * split the paste into reviews, canonicalise synonyms, keep content-word bigrams and trigrams per
 * review, and count how many negative reviews mention each theme. Pure.
 */
import { fitContext } from "@/lib/ads/ai";

export interface MinedReview { asin: string; stars: number | null; title: string | null; body: string; sentences: string[] }
export interface SynonymGroup {
  /** The theme's name in the table ("too small"). */
  theme: string;
  /** The word the terms become in phrases ("small": "tiny strap" → "small strap"). */
  canon: string;
  terms: string[];
}
export interface Theme {
  theme: string;
  /** A synonym group (any of its terms), or a phrase found in the reviews. */
  kind: "group" | "phrase";
  reviews: number;
  /** Share of the negative reviews pasted that mention it, %. */
  pct: number;
  asins: string[];
  /** Up to three sentences from different reviews. */
  examples: string[];
}

export const DEFAULT_SYNONYMS: SynonymGroup[] = [
  { theme: "breaks", canon: "breaks", terms: ["broke", "broken", "breaks", "break", "breaking", "snapped", "snaps", "snap", "fell apart", "falls apart", "falling apart", "cracked", "cracks"] },
  { theme: "too small", canon: "small", terms: ["small", "smaller", "tiny", "short"] },
  { theme: "leaks", canon: "leaks", terms: ["leak", "leaks", "leaking", "leaked", "leaky"] },
  { theme: "smells", canon: "smells", terms: ["smell", "smells", "smelly", "odour", "odor", "stinks"] },
  { theme: "stopped working", canon: "stopped working", terms: ["stopped working", "stops working", "no longer works", "doesn't work", "does not work", "didn't work", "not working"] },
];

/* ===================== splitting ===================== */

const STAR = /^([1-5])(?:[.,]0)? out of 5 stars\s*(.*)$/i;
const STAR_GLYPHS = /^([★]{1,5})[☆]{0,4}\s*(.*)$/;
const REVIEWED = /^Reviewed in .+ on \d/i;
const NOISE = [
  /^verified purchase$/i, /^(colou?r|size|style|pattern|design|configuration|pattern name|size name|colour name)\s*:/i,
  /found this helpful\.?$/i, /^helpful$/i, /^report( abuse)?$/i, /^helpful\s*report$/i, /^translate review/i, /^read more$/i,
  /^see (all|more) reviews?/i, /^vine customer review/i, /^top (critical )?reviews?/i, /^images in this review$/i, /^sort by/i, /^filter(ed)? by/i,
];
const isNoise = (l: string) => REVIEWED.test(l) || NOISE.some((r) => r.test(l));
const starOf = (l: string): { stars: number; title: string } | null => {
  const m = l.match(STAR) ?? l.match(STAR_GLYPHS);
  if (!m) return null;
  return { stars: /^\d/.test(m[1]) ? Number(m[1]) : m[1].length, title: m[2].trim() };
};

/** Sentences: the title on its own, then the body split at . ! ? */
export function sentencesOf(title: string | null, body: string): string[] {
  const out = title ? [title] : [];
  for (const s of body.split(/(?<=[.!?])\s+/)) if (s.trim().length > 2) out.push(s.trim());
  return out;
}

function build(asin: string, stars: number | null, title: string | null, lines: string[]): MinedReview | null {
  const body = lines.filter((l) => l && !isNoise(l)).join(" ").replace(/\s+/g, " ").trim();
  if (!body && !title) return null;
  return { asin, stars, title: title || null, body, sentences: sentencesOf(title || null, body) };
}

/**
 * One ASIN's paste into reviews. Amazon's page: "1.0 out of 5 stars <title>" starts a review (the
 * reviewer's name sits just before it); else "Reviewed in the United Kingdom on …" lines mark them
 * (the title just before); else blank lines separate them.
 */
export function splitReviews(asin: string, text: string): MinedReview[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const starAt = lines.map((l, i) => (starOf(l) ? i : -1)).filter((i) => i >= 0);
  const out: MinedReview[] = [];
  if (starAt.length) {
    starAt.forEach((at, k) => {
      const end = k + 1 < starAt.length ? starAt[k + 1] : lines.length;
      const chunk = lines.slice(at + 1, end);
      // The next reviewer's name: the short line(s) after this review's last noise line.
      if (k + 1 < starAt.length) {
        const lastNoise = chunk.reduce((a, l, i) => (l && isNoise(l) ? i : a), -1);
        const tail = chunk.slice(lastNoise + 1).filter(Boolean);
        if (lastNoise >= 0 && tail.length <= 2 && tail.every((l) => l.length < 50)) chunk.length = lastNoise + 1;
        else if (lastNoise < 0) { while (chunk.length && !chunk[chunk.length - 1]) chunk.pop(); if (chunk.length > 1 && chunk[chunk.length - 1].length < 40 && !/[.!?]$/.test(chunk[chunk.length - 1])) chunk.pop(); }
      }
      const s = starOf(lines[at])!;
      const r = build(asin, s.stars, s.title, chunk);
      if (r) out.push(r);
    });
    return out;
  }
  const revAt = lines.map((l, i) => (REVIEWED.test(l) ? i : -1)).filter((i) => i >= 0);
  if (revAt.length) {
    const titleAt = revAt.map((at) => { let j = at - 1; while (j >= 0 && !lines[j]) j--; return j; });
    revAt.forEach((at, k) => {
      const end = k + 1 < revAt.length ? (titleAt[k + 1] > at ? titleAt[k + 1] : revAt[k + 1]) : lines.length;
      const t = titleAt[k] >= 0 && (k === 0 || titleAt[k] > revAt[k - 1]) ? lines[titleAt[k]] : null;
      const r = build(asin, null, t && !isNoise(t) ? t : null, lines.slice(at + 1, end));
      if (r) out.push(r);
    });
    return out;
  }
  for (const para of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const r = build(asin, null, null, para.split("\n").map((l) => l.trim()));
    if (r) out.push(r);
  }
  return out;
}

/** "Paste all": sections that each start with a line "ASIN: B0…". */
export function splitPasteAll(text: string): { sections: { asin: string; text: string }[]; ignored: number } {
  const parts = text.replace(/\r/g, "").split(/^\s*ASIN\s*[:\-]\s*([A-Z0-9]{10})\s*$/im);
  const sections: { asin: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const asin = parts[i].toUpperCase(), body = parts[i + 1]?.trim() ?? "";
    const had = sections.find((s) => s.asin === asin);
    if (had) had.text += `\n\n${body}`;
    else if (body) sections.push({ asin, text: body });
  }
  return { sections, ignored: parts[0].trim().length };
}

/* ===================== phrases ===================== */

const STOP = new Set(`a about above after again against all almost also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did do does doing done down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i i'd i'll i'm i've if in into is it it's its itself just let's me more most much my myself nor of off on once only or other others ought our ours ourselves out over own same she should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to under until up upon us very was wasn't we we'd we'll we're we've were weren't what what's when where which while who whom why will with would wouldn't you you'd you'll you're you've your yours yourself yourselves
  amazon product item items bought buy buying purchased purchase ordered order received arrived delivery delivered one ones thing things get got getting use used using really quite bit lot lots even still well also though however anyway would'nt im ive dont didnt doesnt its thats
  just like actually literally definitely totally simply first second third two three four five six seven eight nine ten days day week weeks month months year years time times after within since ago back went go going come came make made makes say said see seen look looked looks looking far think thought know want wanted need needed give gave given put take took
  star stars review reviews rating seller sellers money price cost paid pay worth return returned returning refund replacement replaced`.split(/\s+/).filter(Boolean));
/** Words that only qualify (not, too): a phrase needs at least one other word. */
const WEAK = new Set(["not", "no", "too", "never", "doesn't", "don't", "won't", "didn't", "isn't", "can't", "nothing", "very", "so"]);
// Negations and "too" carry the complaint ("too small", "not sturdy"): keep them.
for (const w of ["not", "no", "too", "never", "doesn't", "don't", "won't", "didn't", "isn't", "can't"]) STOP.delete(w);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lower-case, straighten apostrophes, and turn every synonym into its group's word. */
export function canonicalise(text: string, groups: SynonymGroup[]): string {
  let t = ` ${text.toLowerCase().replace(/[’‘`]/g, "'")} `;
  const pairs = groups.flatMap((g) => g.terms.map((term) => ({ term: term.toLowerCase().trim(), canon: g.canon.toLowerCase().trim() }))).filter((p) => p.term).sort((a, b) => b.term.length - a.term.length);
  for (const p of pairs) t = t.replace(new RegExp(`(?<![a-z0-9'])${esc(p.term)}(?![a-z0-9'])`, "g"), `\u0000${p.canon.replace(/ /g, "\u0001")}\u0000`);
  return t.replace(/\u0000/g, " ").replace(/\u0001/g, " ").replace(/\s+/g, " ").replace(/ ([;,.!?:])/g, "$1").trim();
}

/** Content words, plurals folded ("lids" → "lid"), except the groups' own words ("breaks"). */
export const tokensOf = (canon: string, keep: Set<string> = new Set()) => (canon.match(/[a-z0-9']+/g) ?? [])
  .map((w) => w.replace(/^'+|'+$/g, ""))
  .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
  .map((w) => (!keep.has(w) && w.length >= 4 && /s$/.test(w) && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w));

/** The sentence's content-word bigrams and trigrams (stop words dropped, so they bridge). */
export function phrasesOf(tokens: string[]): string[] {
  const out = new Set<string>();
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const g = tokens.slice(i, i + n);
      if (g.every((w) => WEAK.has(w)) || new Set(g).size < n || WEAK.has(g[n - 1])) continue;
      if (g.filter((w) => !WEAK.has(w)).every((w) => w.length < 3)) continue;
      out.add(g.join(" "));
    }
  }
  return [...out];
}

/* ===================== themes ===================== */

/**
 * Themes across every review: each synonym group, and each phrase in enough reviews (2, or 4% of
 * them on a big paste). A phrase that adds nothing (the same reviews as a shorter phrase inside it,
 * or its group's) is dropped. Sorted by reviews mentioning it.
 */
export function mineThemes(reviews: MinedReview[], groups: SynonymGroup[] = DEFAULT_SYNONYMS, opts: { max?: number } = {}): { total: number; themes: Theme[] } {
  const total = reviews.length;
  const hits = new Map<string, { kind: Theme["kind"]; ids: Set<number>; asins: Set<string>; examples: Map<number, string> }>();
  const hit = (key: string, kind: Theme["kind"], id: number, asin: string, sentence: string) => {
    const h = hits.get(key) ?? { kind, ids: new Set(), asins: new Set(), examples: new Map() };
    h.ids.add(id); h.asins.add(asin);
    if (!h.examples.has(id)) h.examples.set(id, sentence);
    hits.set(key, h);
  };
  const canonWords = groups.map((g) => ({ g, words: g.canon.toLowerCase().split(/\s+/) }));
  const keep = new Set(canonWords.flatMap((c) => c.words));
  reviews.forEach((r, id) => {
    for (const s of r.sentences) {
      const c = canonicalise(s, groups);
      const words = ` ${c.match(/[a-z0-9']+/g)?.join(" ") ?? ""} `;
      for (const { g, words: cw } of canonWords) if (words.includes(` ${cw.join(" ")} `)) hit(g.theme, "group", id, r.asin, s);
      for (const p of phrasesOf(tokensOf(c, keep))) hit(p, "phrase", id, r.asin, s);
    }
  });
  // Word-order twins ("breaks lid", "lid breaks") are one phrase: the commoner order, both reviews.
  const byBag = new Map<string, string[]>();
  for (const [k, h] of hits) if (h.kind === "phrase") { const bag = k.split(" ").sort().join(" "); byBag.set(bag, [...(byBag.get(bag) ?? []), k]); }
  for (const keys of byBag.values()) {
    if (keys.length < 2) continue;
    keys.sort((a, b) => hits.get(b)!.ids.size - hits.get(a)!.ids.size || a.localeCompare(b));
    const into = hits.get(keys[0])!;
    for (const k of keys.slice(1)) {
      const h = hits.get(k)!;
      for (const id of h.ids) { into.ids.add(id); if (!into.examples.has(id)) into.examples.set(id, h.examples.get(id)!); }
      for (const x of h.asins) into.asins.add(x);
      hits.delete(k);
    }
  }
  const minReviews = Math.max(2, Math.round(total * 0.04));
  const same = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));
  const groupNames = new Set(groups.map((g) => g.theme));
  const entries = [...hits.entries()].filter(([k, h]) => (h.kind === "group" ? h.ids.size > 0 : h.ids.size >= minReviews && !groupNames.has(k)));
  // A trigram with the same reviews as both its halves says it best ("lid pop open"): the halves go.
  const halvesOf = (k: string) => { const t = k.split(" "); return t.length === 3 ? [t.slice(0, 2).join(" "), t.slice(1).join(" ")] : []; };
  const drop = new Set<string>();
  for (const [k, h] of entries) {
    const halves = halvesOf(k);
    if (halves.length && halves.every((b) => { const o = hits.get(b); return o && same(o.ids, h.ids); })) halves.forEach((b) => drop.add(b));
  }
  const kept = entries.filter(([k, h]) => {
    if (h.kind === "group") return true;
    if (drop.has(k)) return false;
    const toks = k.split(" ");
    // The same reviews as a shorter phrase inside it: the shorter says it.
    const halves = halvesOf(k);
    if (halves.length && !halves.every((b) => drop.has(b)) && halves.some((b) => { const o = hits.get(b); return o && o.ids.size >= minReviews && same(o.ids, h.ids); })) return false;
    // The same reviews as its group, and only the group's word and qualifiers: the group says it.
    for (const { g, words } of canonWords) {
      const rest = toks.filter((w) => !words.includes(w) && !WEAK.has(w));
      const gh = hits.get(g.theme);
      if (rest.length === 0 && gh && toks.some((w) => words.includes(w))) return false;
      if (gh && same(gh.ids, h.ids) && toks.length === 2 && rest.length === 0) return false;
    }
    return true;
  });
  const themes = kept.map(([k, h]): Theme => ({
    theme: k, kind: h.kind, reviews: h.ids.size, pct: total ? Math.round((h.ids.size / total) * 1000) / 10 : 0,
    asins: [...h.asins].sort(), examples: [...h.examples.values()].slice(0, 3),
  })).sort((a, b) => b.reviews - a.reviews || (a.kind === "group" ? -1 : 1) - (b.kind === "group" ? -1 : 1) || a.theme.localeCompare(b.theme));
  return { total, themes: themes.slice(0, opts.max ?? 40) };
}

/** Reviews for several ASINs' pastes. */
export function reviewsOf(dumps: { asin: string; text: string }[]): MinedReview[] {
  return dumps.flatMap((d) => splitReviews(d.asin, d.text));
}

/* ===================== Gate 4 prefill ===================== */

/** A draft of the six words from a theme: "the only pill box whose lid doesn't break". */
export function sixWordsDraft(theme: string, product: string): string {
  const x = product.trim().toLowerCase() || "one";
  const t = theme.trim().toLowerCase();
  const before = (w: string) => t.split(w)[0].trim();
  if (/\bbreaks\b/.test(t)) return before("breaks") ? `the only ${x} whose ${before("breaks")} doesn't break` : `the only ${x} that doesn't break`;
  if (/\bsmall\b/.test(t)) return before("small").replace(/^too\b/, "").trim() ? `the only ${x} with a bigger ${t.replace(/\btoo\b|\bsmall\b/g, "").trim()}` : `the only ${x} that's big enough`;
  if (/\bleaks\b/.test(t)) return `the only ${x} that doesn't leak`;
  if (/\bsmells\b/.test(t)) return `the only ${x} with no smell`;
  if (/stopped working/.test(t)) return `the only ${x} that keeps working`;
  if (/^(not|no) /.test(t)) return `the only ${x} that's ${t.replace(/^(not|no) /, "")}`;
  if (/^too /.test(t)) return `the only ${x} that isn't ${t}`;
  return `the only ${x} without the ${t}`;
}

/* ===================== "Ask Claude to summarise" (on a click only) ===================== */

export const REVIEW_SUMMARY_SYSTEM = [
  "You read 1–3 star Amazon UK reviews for a private-label seller looking for a complaint a factory can fix cheaply.",
  "Use only the reviews and themes you are given; every share you state must come from the themes' figures. British English.",
  "A fixable complaint is about the product itself (materials, size, design, a part that fails), not delivery, the seller, or price.",
].join(" ");

export const REVIEW_SUMMARY_TOOL = {
  name: "review_summary",
  description: "The top three fixable complaints in the reviews, one sentence each.",
  input_schema: {
    type: "object" as const,
    properties: {
      complaints: {
        type: "array", minItems: 3, maxItems: 3, description: "The three most common complaints a factory could fix, commonest first.",
        items: {
          type: "object",
          properties: {
            sentence: { type: "string", description: "One sentence: the complaint, how common it is (from the themes), and what a factory would change." },
            theme: { type: ["string", "null"], description: "The matching theme from the list, exactly as written, or null." },
          },
          required: ["sentence", "theme"],
        },
      },
    },
    required: ["complaints"],
  },
};
export interface ReviewSummary { complaints: { sentence: string; theme: string | null }[] }

/** What the summary sends: the themes with their shares, and the reviews (trimmed to the cap). */
export function buildReviewSummaryContext(product: string, reviews: MinedReview[], themes: Theme[]) {
  return fitContext({
    product,
    negative_reviews: reviews.length,
    themes: themes.slice(0, 15).map((t) => ({ theme: t.theme, reviews: t.reviews, pct_of_negative_reviews: t.pct, listings: t.asins.length })),
    reviews: reviews.map((r) => ({ asin: r.asin, stars: r.stars, text: [r.title, r.body].filter(Boolean).join(". ").slice(0, 500) })),
  }, ["reviews"]);
}
