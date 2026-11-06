/**
 * The spike's web path for one product: search, keep one page per supplier, read each page safely,
 * extract, check. Every stage is saved, so a re-run after a failure or a budget stop pays for nothing
 * twice. Touches no database: everything goes through `deps`.
 */
import { createHash } from "node:crypto";
import type { Usage } from "../ads/ai";
import { checkExtraction, type Checked, type CountryFields, type Extraction } from "./extract";
import { USER_AGENT, type SafeFetchResult } from "./fetchGuard";
import { findContactLink, isPlatformHost, pageText } from "./pageText";
import { buildQueries, type PlannedQuery } from "./queries";
import { robotsAllows } from "./robots";
import type { SearchHit, SearchProvider } from "./search";
import type { TestItem } from "./testSet";

export interface Store { get<T>(key: string): Promise<T | null>; put(key: string, value: unknown): Promise<void> }

export class Budget {
  constructor(private readonly maxUsd: number, private used = 0) {}
  add(usd: number) { this.used += usd; }
  get exhausted() { return this.used >= this.maxUsd; }
  get spent() { return this.used; }
}

export type PageStatus = "read" | "snippet_only" | "robots_blocked" | "fetch_failed" | "no_text" | "no_answer" | "model_error" | "budget_stop";
export interface PageResult {
  url: string; title: string; snippet: string; status: PageStatus; reason?: string;
  extraction: Checked | null; countryFrom?: "page" | "contact"; truncated?: boolean; costUsd: number;
}
export interface ProductRun {
  item: TestItem;
  results: Partial<Record<SearchProvider, PageResult[]>>;
  /** Providers whose search failed part-way: their results are incomplete. */
  partial: SearchProvider[];
  stoppedForBudget: boolean;
  queriesUsed: Partial<Record<SearchProvider, number>>;
}
export interface SpikeDeps {
  model: string;
  search: Partial<Record<SearchProvider, (q: PlannedQuery) => Promise<SearchHit[]>>>;
  fetchPage: (url: string) => Promise<SafeFetchResult>;
  fetchRobots: (origin: string) => Promise<string | null>;
  extract: (productQuery: string, pageText: string, url: string) => Promise<{ extraction: Extraction | null; stop: string; usage: Usage }>;
  extractCountry: (pageText: string, url: string) => Promise<CountryFields & { usage: Usage }>;
  spend: (usage: Usage) => number;
  store: Store;
  budget: Budget;
  /** Pages read at once. The budget can overrun by this many calls less one. */
  concurrency?: number;
}

const PAGES_PER_PROVIDER = 20;
/** Under this there's nothing to read (a page that only draws itself with scripts): don't pay to ask. */
const MIN_TEXT = 200;

const hashOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/** One supplier per registrable domain; on a platform, each shop's own subdomain is its own supplier. */
export function supplierDomain(url: string): string | null {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
  if (isPlatformHost(host)) return host;
  const parts = host.split(".");
  const secondLevel = parts.length >= 3 && /^(co|com|org|net|ac|gov|ltd|plc|me)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(secondLevel ? -3 : -2).join(".");
}

export function dedupeByDomain(hits: SearchHit[]): SearchHit[] {
  const best = new Map<string, SearchHit>();
  for (const h of [...hits].sort((a, b) => a.rank - b.rank)) {
    const domain = supplierDomain(h.url);
    if (domain && !best.has(domain)) best.set(domain, h);
  }
  return [...best.values()];
}

type TextRead = { text: string; truncated: boolean; contact: string | null };
type ReadOutcome = { ok: true; read: TextRead } | { ok: false; status: "robots_blocked" | "fetch_failed"; reason: string };

async function robotsFor(origin: string, deps: SpikeDeps): Promise<string | null> {
  const key = `robots/${hashOf(origin)}`;
  const saved = await deps.store.get<{ txt: string | null }>(key);
  if (saved) return saved.txt;
  const txt = await deps.fetchRobots(origin);
  await deps.store.put(key, { txt });
  return txt;
}

/** Robots first, then the guarded fetch. Saved page text is shared by every model. */
async function readPage(url: string, deps: SpikeDeps): Promise<ReadOutcome> {
  const key = `text/${hashOf(url)}`;
  const saved = await deps.store.get<TextRead>(key);
  if (saved) return { ok: true, read: saved };
  const u = new URL(url);
  if (!robotsAllows(await robotsFor(u.origin, deps), u.pathname + u.search, USER_AGENT.split("/")[0])) return { ok: false, status: "robots_blocked", reason: "robots.txt" };
  const res = await deps.fetchPage(url);
  if (res.status !== "ok") return { ok: false, status: "fetch_failed", reason: res.reason };
  const { text, truncated } = pageText(res.html);
  const read: TextRead = { text, truncated: truncated || res.truncated, contact: findContactLink(res.html, res.finalUrl) };
  await deps.store.put(key, read);
  return { ok: true, read };
}

async function processPage(hit: SearchHit, query: string, deps: SpikeDeps): Promise<PageResult> {
  const base = { url: hit.url, title: hit.title, snippet: hit.snippet, extraction: null, costUsd: 0 };
  if (isPlatformHost(new URL(hit.url).hostname)) return { ...base, status: "snippet_only" };
  const key = `pages/${deps.model}/${hashOf(hit.url)}`;
  const saved = await deps.store.get<PageResult>(key);
  if (saved) return saved;
  const done = async (r: PageResult) => { await deps.store.put(key, r); return r; };

  const outcome = await readPage(hit.url, deps);
  if (!outcome.ok) return done({ ...base, status: outcome.status, reason: outcome.reason });
  const { text, truncated, contact } = outcome.read;
  if (text.length < MIN_TEXT) return done({ ...base, status: "no_text", truncated });
  if (deps.budget.exhausted) return { ...base, status: "budget_stop", truncated };

  let answer: Awaited<ReturnType<SpikeDeps["extract"]>>;
  try { answer = await deps.extract(query, text, hit.url); }
  catch (e) { return { ...base, status: "model_error", reason: (e as Error).message.slice(0, 200), truncated }; }
  let cost = deps.spend(answer.usage);
  deps.budget.add(cost);
  if (!answer.extraction) return done({ ...base, status: "no_answer", reason: answer.stop, costUsd: cost, truncated });

  let checked = checkExtraction(answer.extraction, text, hit.url);
  let countryFrom: PageResult["countryFrom"] = checked.country ? "page" : undefined;
  if (!checked.country && checked.productMatch !== "no" && contact && !deps.budget.exhausted) {
    const contactPage = await readPage(contact, deps);
    if (contactPage.ok && contactPage.read.text.length >= 3) {
      try {
        const { usage, ...found } = await deps.extractCountry(contactPage.read.text, contact);
        const extra = deps.spend(usage);
        deps.budget.add(extra);
        cost += extra;
        if (found.country) { checked = { ...checked, ...found }; countryFrom = "contact"; }
      } catch { /* The page's own answer stands: country stays Unknown. */ }
    }
  }
  return done({ ...base, status: "read", extraction: checked, countryFrom, costUsd: cost, truncated });
}

async function searchProvider(provider: SearchProvider, item: TestItem, deps: SpikeDeps): Promise<{ hits: SearchHit[]; used: number; failed: boolean }> {
  const search = deps.search[provider]!;
  const hits: SearchHit[] = [];
  let used = 0;
  for (const [i, q] of buildQueries(item).entries()) {
    const key = `search-${provider}/${item.id}-${i}`;
    let found = await deps.store.get<SearchHit[]>(key);
    if (!found) {
      try { found = await search(q); }
      catch { return { hits, used, failed: true }; } // The rest would fail too; a re-run retries from here.
      await deps.store.put(key, found);
    }
    used++;
    hits.push(...found);
  }
  return { hits, used, failed: false };
}

export async function runProduct(item: TestItem, deps: SpikeDeps): Promise<ProductRun> {
  const run: ProductRun = { item, results: {}, partial: [], stoppedForBudget: false, queriesUsed: {} };
  const inFlight = new Map<string, Promise<PageResult>>(); // A page both providers found is read once.
  for (const provider of Object.keys(deps.search) as SearchProvider[]) {
    const { hits, used, failed } = await searchProvider(provider, item, deps);
    if (failed) run.partial.push(provider);
    run.queriesUsed[provider] = used;
    const chosen = dedupeByDomain(hits).slice(0, PAGES_PER_PROVIDER);
    const results: PageResult[] = new Array(chosen.length);
    let next = 0;
    const worker = async () => {
      while (next < chosen.length) {
        const i = next++;
        const h = chosen[i];
        let p = inFlight.get(h.url);
        if (!p) { p = processPage(h, item.query, deps); inFlight.set(h.url, p); }
        results[i] = await p;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 1) }, worker));
    run.results[provider] = results;
  }
  run.stoppedForBudget = Object.values(run.results).some((rs) => rs?.some((r) => r.status === "budget_stop"));
  return run;
}
