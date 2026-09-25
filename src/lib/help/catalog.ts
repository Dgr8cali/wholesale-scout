/**
 * The help centre's articles: markdown files under content/help/, each with a short header
 *
 *   ---
 *   title: Runs
 *   summary: One line shown in search results.
 *   synonyms: [batch, screening job]
 *   route: /runs          (a page's article: the page it explains)
 *   gate: priceBand       (a gate's article: the gate it explains)
 *   order: 2              (position within its section)
 *   ---
 *
 * The slug is the path without ".md" (pages/runs), the section comes from the folder.
 */

export interface ArticleMeta {
  slug: string;
  title: string;
  summary: string;
  synonyms: string[];
  route: string | null;
  gate: string | null;
  section: string;
  order: number;
}

export interface Article extends ArticleMeta {
  /** The markdown body, without the header. */
  body: string;
}

/** Sections in the order the Help page lists them, by folder ("" is the top level). */
export const SECTIONS: { folder: string; label: string }[] = [
  { folder: "", label: "Start here" },
  { folder: "pages", label: "Pages" },
  { folder: "concepts", label: "How it works" },
  { folder: "gates", label: "Gates" },
  { folder: "howto", label: "How-tos" },
  { folder: "reference", label: "Reference" },
];

const sectionOf = (slug: string) => {
  const folder = slug.includes("/") ? slug.slice(0, slug.indexOf("/")) : "";
  return SECTIONS.find((s) => s.folder === folder)?.label ?? "Other";
};

/** Split a file into its header fields and body. */
export function parseArticle(slug: string, raw: string): Article {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`help/${slug}.md: no --- header`);
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  if (!fields.title) throw new Error(`help/${slug}.md: no title`);
  const list = (v: string | undefined) =>
    (v ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const unquote = (v: string | undefined) => (v ?? "").replace(/^["']|["']$/g, "");
  return {
    slug,
    title: unquote(fields.title),
    summary: unquote(fields.summary),
    synonyms: list(fields.synonyms),
    route: fields.route ? unquote(fields.route) : null,
    gate: fields.gate ? unquote(fields.gate) : null,
    section: sectionOf(slug),
    order: fields.order ? Number(fields.order) : 100,
    body: m[2].trim(),
  };
}

/** Markdown reduced to words, for search. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|]+/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchDoc extends ArticleMeta {
  text: string;
  /** The article's section headings, so a term ("Hurdle price") finds its place in the glossary. */
  headings: string[];
}

/** The ## and ### headings of a markdown body. */
export const headingsOf = (md: string) => [...md.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].replace(/[*_`]/g, "").trim());

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  /** A few words around the first place the body matched. */
  snippet: string | null;
  /** The heading the whole query names, to link straight to it. */
  heading: string | null;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9£%]+/).filter(Boolean);

/**
 * Articles matching every word of the query in the title, synonyms, summary or body; titles and
 * synonyms rank first ("ungate" finds the brand approval how-to through its synonyms).
 */
export function search(docs: SearchDoc[], query: string): SearchHit[] {
  const terms = words(query);
  if (!terms.length) return [];
  const phrase = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const title = doc.title.toLowerCase();
    const syn = doc.synonyms.map((s) => s.toLowerCase());
    const summary = doc.summary.toLowerCase();
    const text = doc.text.toLowerCase();
    const heads = (doc.headings ?? []).map((h) => h.toLowerCase());
    let score = 0;
    let all = true;
    for (const t of terms) {
      const inTitle = title.includes(t), inSyn = syn.some((s) => s.includes(t)), inSummary = summary.includes(t), inText = text.includes(t);
      const inHead = heads.some((h) => h.includes(t));
      if (!inTitle && !inSyn && !inSummary && !inText && !inHead) { all = false; break; }
      score += (inTitle ? 6 : 0) + (inSyn ? 5 : 0) + (inHead ? 3 : 0) + (inSummary ? 2 : 0) + (inText ? 1 : 0);
    }
    if (!all) continue;
    if (title === phrase || syn.includes(phrase)) score += 20;
    else if (title.includes(phrase) || syn.some((s) => s.includes(phrase))) score += 8;
    // A heading that is the query: a glossary term, or a section about exactly that.
    const hi = heads.findIndex((h) => h === phrase);
    if (hi >= 0) score += 18;
    else if (heads.some((h) => h.includes(phrase))) score += 4;
    const at = text.indexOf(terms[0]);
    const snippet = at < 0 ? null : `${at > 60 ? "…" : ""}${doc.text.slice(Math.max(0, at - 60), at + 100).trim()}…`;
    hits.push({ doc, score, snippet, heading: hi >= 0 ? doc.headings[hi] : null });
  }
  return hits.sort((a, b) => b.score - a.score || a.doc.order - b.doc.order);
}

/** The article for a page of the app: the longest route that the path starts with. */
export function articleForPath(docs: ArticleMeta[], path: string): ArticleMeta | null {
  let best: ArticleMeta | null = null;
  for (const d of docs) {
    if (!d.route) continue;
    const hit = d.route === "/" ? path === "/" : path === d.route || path.startsWith(`${d.route}/`);
    if (hit && (!best || d.route.length > best.route!.length)) best = d;
  }
  return best;
}

/** A heading's anchor: "Hurdle price" → hurdle-price. */
export const anchor = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
