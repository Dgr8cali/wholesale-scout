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
import { SearchError, type SearchHit, type SearchProvider } from "./search";
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
  /** Failed for a passing reason (a timeout, a 503): not saved, so a re-run tries it again. */
  temporary?: boolean;
  extraction: Checked | null; countryFrom?: "page" | "contact"; truncated?: boolean; costUsd: number;
}
export interface ProductRun {
  item: TestItem;
  results: Partial<Record<SearchProvider, PageResult[]>>;
  /** Providers whose search failed part-way: their results are incomplete. */
  partial: SearchProvider[];
  searchErrors: string[];
  stoppedForBudget: boolean;
  /** The deadline passed, so pages may be left unread. */
  stoppedForTime?: boolean;
  queriesUsed: Partial<Record<SearchProvider, number>>;
}
export interface SpikeDeps {
  model: string;
  search: Partial<Record<SearchProvider, (q: PlannedQuery) => Promise<SearchHit[]>>>;
  /** `allow` says why an address is refused, or null. It's asked again for every redirect. */
  fetchPage: (url: string, allow?: (url: URL) => Promise<string | null>) => Promise<SafeFetchResult>;
  /** Null when the site has no robots file. Throws when it can't be reached. */
  fetchRobots: (origin: string) => Promise<string | null>;
  extract: (productQuery: string, pageText: string, url: string) => Promise<{ extraction: Extraction | null; stop: string; usage: Usage }>;
  extractCountry: (pageText: string, url: string) => Promise<CountryFields & { usage: Usage }>;
  spend: (usage: Usage) => number;
  store: Store;
  budget: Budget;
  /** Pages read at once. The budget can overrun by this many calls less one. */
  concurrency?: number;
  /** Readable pages to stop at, per search provider. Failed pages let it try up to twice as many. */
  readablePerProvider?: number;
  /** Epoch ms after which no new page or contact page is started. Pages under way finish. */
  deadlineAt?: number;
}

/** Only the top 10 readable pages reach the grading sheet, so stop paying there. */
const READABLE_PER_PROVIDER = 10;
/** Under this there's nothing to read (a page that only draws itself with scripts): don't pay to ask. */
const MIN_TEXT = 200;

export const hashOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

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
type ReadOutcome = { ok: true; read: TextRead } | { ok: false; status: "robots_blocked" | "fetch_failed"; reason: string; temporary?: boolean };

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
  const allow = async (u: URL): Promise<string | null> => {
    if (isPlatformHost(u.hostname)) return "redirected to a platform page";
    return robotsAllows(await robotsFor(u.origin, deps), u.pathname + u.search, USER_AGENT.split("/")[0]) ? null : "robots.txt";
  };
  // A robots.txt that can't be reached means "don't crawl for now".
  let refused: string | null;
  try { refused = await allow(new URL(url)); }
  catch { return { ok: false, status: "fetch_failed", reason: "robots.txt couldn't be reached", temporary: true }; }
  if (refused) return { ok: false, status: "robots_blocked", reason: refused };
  const res = await deps.fetchPage(url, allow);
  if (res.status !== "ok") {
    const temporary = res.status === "error" || (res.status === "http_error" && /status (429|5\d\d)/.test(res.reason));
    return { ok: false, status: "fetch_failed", reason: res.reason, temporary };
  }
  try {
    const { text, truncated } = pageText(res.html);
    const read: TextRead = { text, truncated: truncated || res.truncated, contact: findContactLink(res.html, res.finalUrl) };
    await deps.store.put(key, read);
    return { ok: true, read };
  } catch (e) {
    return { ok: false, status: "fetch_failed", reason: (e as Error).message.slice(0, 200) }; // One bad page can't stop the run.
  }
}

async function pay(usd: number, deps: SpikeDeps) {
  deps.budget.add(usd);
  await deps.store.put("budget", { spent: deps.budget.spent }); // Saved every time, so a crash can't lose it from the cap.
}

const pastDeadline = (deps: SpikeDeps) => deps.deadlineAt != null && Date.now() >= deps.deadlineAt;

async function processPage(hit: SearchHit, item: TestItem, deps: SpikeDeps): Promise<PageResult> {
  const base = { url: hit.url, title: hit.title, snippet: hit.snippet, extraction: null, costUsd: 0 };
  if (isPlatformHost(new URL(hit.url).hostname)) return { ...base, status: "snippet_only" };
  // Per product: the same wholesaler's page says something different about bin bags and about foil.
  const key = `pages/${deps.model}/${item.id}/${hashOf(hit.url)}`;
  const saved = await deps.store.get<PageResult>(key);
  if (saved) return saved;
  const done = async (r: PageResult) => { await deps.store.put(key, r); return r; };

  const outcome = await readPage(hit.url, deps);
  if (!outcome.ok) {
    if (outcome.temporary) return { ...base, status: outcome.status, reason: outcome.reason, temporary: true };
    return done({ ...base, status: outcome.status, reason: outcome.reason });
  }
  const { text, truncated, contact } = outcome.read;
  if (text.length < MIN_TEXT) return done({ ...base, status: "no_text", truncated });
  if (deps.budget.exhausted) return { ...base, status: "budget_stop", truncated };

  let answer: Awaited<ReturnType<SpikeDeps["extract"]>>;
  try { answer = await deps.extract(item.query, text, hit.url); }
  catch (e) { return { ...base, status: "model_error", reason: (e as Error).message.slice(0, 200), truncated }; }
  let cost = deps.spend(answer.usage);
  await pay(cost, deps);
  if (!answer.extraction) return done({ ...base, status: "no_answer", reason: answer.stop, costUsd: cost, truncated });

  let checked = checkExtraction(answer.extraction, text, hit.url, item.query);
  let countryFrom: PageResult["countryFrom"] = checked.country ? "page" : undefined;
  if (!checked.country && checked.productMatch !== "no" && contact && !deps.budget.exhausted && !pastDeadline(deps)) {
    const contactPage = await readPage(contact, deps);
    if (contactPage.ok && contactPage.read.text.length >= 3) {
      try {
        const { usage, ...found } = await deps.extractCountry(contactPage.read.text, contact);
        const extra = deps.spend(usage);
        await pay(extra, deps);
        cost += extra;
        if (found.country) { checked = { ...checked, ...found }; countryFrom = "contact"; }
      } catch { /* The page's own answer stands: country stays Unknown. */ }
    }
  }
  return done({ ...base, status: "read", extraction: checked, countryFrom, costUsd: cost, truncated });
}

/** Whether a page failed to load for a passing reason, so another go could read it. */
export const hasRetryableFetches = (run: ProductRun) =>
  Object.values(run.results).some((rs) => rs?.some((r) => r.status === "fetch_failed" && r.temporary));

async function searchProvider(provider: SearchProvider, item: TestItem, deps: SpikeDeps): Promise<{ hits: SearchHit[]; used: number; errors: string[] }> {
  const search = deps.search[provider]!;
  const hits: SearchHit[] = [], errors: string[] = [];
  let used = 0;
  for (const [i, q] of buildQueries(item).entries()) {
    const key = `search-${provider}/${item.id}-${i}`;
    let found = await deps.store.get<SearchHit[]>(key);
    if (!found) {
      try { found = await search(q); }
      catch (e) {
        errors.push((e as Error).message);
        // A bad key or no credit fails every query; anything else may be one query's bad luck. Not saved, so a re-run retries.
        if (e instanceof SearchError && (e.status === 401 || e.status === 402 || e.outOfCredit)) break;
        continue;
      }
      await deps.store.put(key, found);
    }
    used++;
    hits.push(...found);
  }
  return { hits, used, errors };
}

export async function runProduct(item: TestItem, deps: SpikeDeps): Promise<ProductRun> {
  const run: ProductRun = { item, results: {}, partial: [], searchErrors: [], stoppedForBudget: false, queriesUsed: {} };
  const inFlight = new Map<string, Promise<PageResult>>(); // A page both providers found is read once.
  for (const provider of Object.keys(deps.search) as SearchProvider[]) {
    const { hits, used, errors } = await searchProvider(provider, item, deps);
    if (errors.length) run.partial.push(provider);
    run.searchErrors.push(...errors);
    run.queriesUsed[provider] = used;
    let attempts = (deps.readablePerProvider ?? READABLE_PER_PROVIDER) * 2;
    const chosen = dedupeByDomain(hits).filter((h) => isPlatformHost(new URL(h.url).hostname) || attempts-- > 0);
    const results: PageResult[] = [];
    let next = 0, readable = 0;
    const worker = async () => {
      while (next < chosen.length && readable < (deps.readablePerProvider ?? READABLE_PER_PROVIDER) && !pastDeadline(deps)) {
        const i = next++;
        const h = chosen[i];
        let p = inFlight.get(h.url);
        if (!p) { p = processPage(h, item, deps); inFlight.set(h.url, p); }
        results[i] = await p;
        // Marketplace listings cost nothing and aren't read, so they don't use up the limit.
        if (results[i].status === "read") readable++;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 1) }, worker));
    run.results[provider] = results.filter(Boolean);
  }
  run.stoppedForTime = pastDeadline(deps);
  run.stoppedForBudget = Object.values(run.results).some((rs) => rs?.some((r) => r.status === "budget_stop"));
  return run;
}
