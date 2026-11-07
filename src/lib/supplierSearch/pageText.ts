/** Turn a fetched page into plain text for the model, and find its contact page. Scripts never run. */
import { JSDOM, VirtualConsole } from "jsdom";

const MAX_DEPTH = 1500;
/** More than any real page, and few enough that parsing can't hold up the rest of the app for long. */
const MAX_TAGS = 50_000;
/** Closed by the parser on their own, or never opened: they don't add depth. */
const NO_DEPTH = new Set(["p", "li", "td", "th", "tr", "tbody", "thead", "tfoot", "dt", "dd", "option", "optgroup", "colgroup", "caption", "rp", "rt", "br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr", "html", "head", "body"]);

/**
 * Thousands of tags, flat or nested, stall or crash the parser, so count them first with a plain scan.
 * The lookahead matters: without it a tag that never ends takes time in the square of its length.
 */
function refuseOverbuilt(html: string) {
  let depth = 0, tags = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)(?![\w-])[^<>]*?(\/?)>/g)) {
    if (!m[1] && ++tags > MAX_TAGS) throw new Error("page has too many tags to read");
    if (NO_DEPTH.has(m[2].toLowerCase()) || m[3]) continue;
    depth = m[1] ? Math.max(0, depth - 1) : depth + 1;
    if (depth > MAX_DEPTH) throw new Error("page too deeply nested to read");
  }
}

/** jsdom without a console: a page's broken CSS shouldn't fill the spike's output. */
function parse(html: string, url?: string) {
  refuseOverbuilt(html);
  return new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
}

/** Keeps the start and the end: addresses and company details sit in footers. */
export function pageText(html: string, maxChars = 12_000): { text: string; truncated: boolean } {
  const { window } = parse(html);
  const { document, NodeFilter } = window;
  for (const el of document.querySelectorAll("script, style, noscript, template, [hidden]")) el.remove();
  for (const el of document.querySelectorAll("[style]")) {
    if (/(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(el.getAttribute("style") ?? "")) el.remove();
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue ?? "");
  window.close();
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return { text, truncated: false };
  const tail = Math.floor(maxChars / 4);
  return { text: `${text.slice(0, maxChars - tail)} … ${text.slice(-tail)}`, truncated: true };
}

const CONTACT = /contact|kontakt|impressum|imprint|legal notice|联系/i;
const ABOUT = /about|über uns|ueber-uns|关于/i;
const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** The same site's contact page, else its about page. */
export function findContactLink(html: string, baseUrl: string): string | null {
  const base = new URL(baseUrl);
  const { window } = parse(html, baseUrl);
  let about: string | null = null;
  try {
    for (const a of window.document.querySelectorAll("a[href]")) {
      let target: URL;
      try { target = new URL(a.getAttribute("href") ?? "", base); } catch { continue; }
      if ((target.protocol !== "http:" && target.protocol !== "https:") || bareHost(target.hostname) !== bareHost(base.hostname)) continue;
      if (target.pathname === base.pathname) continue;
      const label = `${a.textContent ?? ""} ${target.pathname}`;
      if (CONTACT.test(label)) return target.href;
      if (!about && ABOUT.test(label)) about = target.href;
    }
    return about;
  } finally { window.close(); }
}

const PLATFORMS = ["alibaba.com", "aliexpress.com", "made-in-china.com", "globalsources.com", "1688.com", "dhgate.com", "tradekey.com", "indiamart.com", "ec21.com", "temu.com"];

/** Price-comparison sites send you to shops, so they aren't suppliers. */
export const isComparisonHost = (host: string) =>
  /(^|\.)(idealo|pricerunner|pricespy|geizhals|billiger|kelkoo|skinflint|guenstiger|ladenzeile)\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host.toLowerCase().replace(/\.$/, ""));

/** Marketplaces the search never opens: results from them stay snippet-only. */
export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return isComparisonHost(h) || PLATFORMS.some((p) => h === p || h.endsWith(`.${p}`)) || /(^|\.)(amazon|ebay)\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h);
}
