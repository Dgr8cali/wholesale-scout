import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Marked } from "marked";
import { anchor, headingsOf, parseArticle, plainText, SECTIONS, type Article, type ArticleMeta, type SearchDoc } from "./catalog";

/** Where the articles live (traced into the deployment by next.config's outputFileTracingIncludes). */
const HELP_DIR = join(process.cwd(), "content", "help");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : []);
}

let cache: Article[] | null = null;

/** Every article, sorted by section then order then title. */
export function articles(dir = HELP_DIR): Article[] {
  if (cache && dir === HELP_DIR) return cache;
  const rank = (s: string) => { const i = SECTIONS.findIndex((x) => x.label === s); return i < 0 ? 99 : i; };
  const all = files(dir)
    .map((f) => parseArticle(relative(dir, f).replace(/\\/g, "/").replace(/\.md$/, ""), readFileSync(f, "utf8")))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.order - b.order || a.title.localeCompare(b.title));
  if (dir === HELP_DIR && process.env.NODE_ENV === "production") cache = all;
  return all;
}

export const meta = (a: Article): ArticleMeta => {
  const { body: _body, ...m } = a;
  void _body;
  return m;
};

export const searchDocs = (): SearchDoc[] => articles().map((a) => ({ ...meta(a), text: plainText(a.body), headings: headingsOf(a.body) }));

export const article = (slug: string) => articles().find((a) => a.slug === slug) ?? null;

const md = new Marked({
  gfm: true,
  renderer: {
    // Headings get anchors, so the glossary's terms can be linked to (/help/reference/glossary#hurdle-price).
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${anchor(html)}">${html}</h${depth}>\n`;
    },
  },
});

/** An article's body as HTML (the content is ours, from the repo). */
export const render = (a: Article) => md.parse(a.body, { async: false }) as string;
