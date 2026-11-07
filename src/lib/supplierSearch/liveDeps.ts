/** The real network and AI behind a search, shared by the spike script and the app. */
import Anthropic from "@anthropic-ai/sdk";
import { extractCountry, extractPage, spendUsd } from "./extract";
import { safeFetch } from "./fetchGuard";
import { supplierDomain, type Budget, type SpikeDeps, type Store } from "./spikeRun";

const PER_DOMAIN_MS = 1_000;
const AI_TIMEOUT_MS = 60_000;

/** One request a second per domain, however many pages are being read at once. */
const nextSlot = new Map<string, number>();
export async function politely<T>(key: string, go: () => Promise<T>, gapMs = PER_DOMAIN_MS): Promise<T> {
  const domain = key.startsWith("search:") ? key : supplierDomain(key) ?? key, now = Date.now();
  const at = Math.max(now, nextSlot.get(domain) ?? 0);
  nextSlot.set(domain, at + gapMs);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return go();
}

/** Keeps a search's page reads for that search only. `onSpend` hears the running total; if it fails, the search carries on. */
export function memoryStore(onSpend?: (usd: number) => unknown): Store {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => (data.get(k) as T) ?? null,
    put: async (k, v) => {
      data.set(k, v);
      if (k !== "budget" || !onSpend) return;
      try { await onSpend((v as { spent: number }).spent); } catch (e) { console.error(`supplier search spend: ${(e as Error).message}`); }
    },
  };
}

export function liveDeps(x: { model: string; budget: Budget; store: Store; search: SpikeDeps["search"]; concurrency: number; readablePerProvider?: number; pageGapMs?: () => number; deadlineAt?: number }): SpikeDeps {
  const client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const gap = () => x.pageGapMs?.() ?? PER_DOMAIN_MS;
  return {
    model: x.model, budget: x.budget, store: x.store, concurrency: x.concurrency, readablePerProvider: x.readablePerProvider, deadlineAt: x.deadlineAt, search: x.search,
    fetchPage: (url, allowUrl) => politely(url, () => safeFetch(url, { allowUrl }), gap()),
    fetchRobots: async (origin) => {
      const url = `${origin}/robots.txt`;
      const r = await politely(url, () => safeFetch(url, { anyType: true, maxBytes: 500_000 }), gap());
      if (r.status === "ok") return r.html;
      // A missing or refused file means no rules; anything else means "don't crawl for now", and is asked again next run.
      if (r.status === "error" || (r.status === "http_error" && /status (429|5\d\d)/.test(r.reason))) throw new Error(`robots.txt: ${r.reason}`);
      return null;
    },
    extract: (productQuery, pageText, url) => extractPage({ client, model: x.model, productQuery, pageText, url }),
    extractCountry: (pageText, url) => extractCountry({ client, model: x.model, pageText, url }),
    spend: (usage) => spendUsd(usage, x.model),
  };
}
