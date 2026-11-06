/** Turn a fetched page into plain text for the model, and find its contact page. Scripts never run. */
import { JSDOM, VirtualConsole } from "jsdom";

/** jsdom without a console: a page's broken CSS shouldn't fill the spike's output. */
const parse = (html: string, url?: string) => new JSDOM(html, { url, virtualConsole: new VirtualConsole() });

/** Keeps the start and the end: addresses and company details sit in footers. */
export function pageText(html: string, maxChars = 12_000): { text: string; truncated: boolean } {
  const { document, NodeFilter } = parse(html).window;
  for (const el of document.querySelectorAll("script, style, noscript, template, [hidden]")) el.remove();
  for (const el of document.querySelectorAll("[style]")) {
    if (/(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(el.getAttribute("style") ?? "")) el.remove();
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.nodeValue ?? "");
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
  const { document } = parse(html, baseUrl).window;
  let about: string | null = null;
  for (const a of document.querySelectorAll("a[href]")) {
    let target: URL;
    try { target = new URL(a.getAttribute("href") ?? "", base); } catch { continue; }
    if ((target.protocol !== "http:" && target.protocol !== "https:") || bareHost(target.hostname) !== bareHost(base.hostname)) continue;
    if (target.pathname === base.pathname) continue;
    const label = `${a.textContent ?? ""} ${target.pathname}`;
    if (CONTACT.test(label)) return target.href;
    if (!about && ABOUT.test(label)) about = target.href;
  }
  return about;
}

const PLATFORMS = ["alibaba.com", "aliexpress.com", "made-in-china.com", "globalsources.com", "1688.com", "dhgate.com", "tradekey.com", "indiamart.com", "ec21.com", "temu.com"];

/** Marketplaces the search never opens: results from them stay snippet-only. */
export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return PLATFORMS.some((p) => h === p || h.endsWith(`.${p}`)) || /(^|\.)(amazon|ebay)\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h);
}
