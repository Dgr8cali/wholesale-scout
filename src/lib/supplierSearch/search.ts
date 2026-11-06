/** Serper and Brave behind one shape, so the spike can compare them on the same products. */
import type { PlannedQuery } from "./queries";

export type SearchProvider = "serper" | "brave";
export interface SearchHit { url: string; title: string; snippet: string; rank: number; provider: SearchProvider; query: string }
interface SearchOpts { apiKey: string; fetchImpl?: typeof fetch }

/** Says only which provider and status: never a key or a header. */
export class SearchError extends Error {
  constructor(readonly provider: SearchProvider, readonly status: number, readonly outOfCredit: boolean) {
    super(`${provider} search failed (status ${status})${outOfCredit ? ": out of credit" : ""}`);
    this.name = "SearchError";
  }
}

async function call<T>(provider: SearchProvider, doFetch: () => Promise<Response>): Promise<T> {
  let res: Response;
  try { res = await doFetch(); } catch { throw new SearchError(provider, 0, false); }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SearchError(provider, res.status, res.status === 402 || /not enough credits|out of credit/i.test(text));
  }
  return (await res.json()) as T;
}

export async function serperSearch(q: PlannedQuery, opts: SearchOpts): Promise<SearchHit[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const body = await call<{ organic?: { link: string; title?: string; snippet?: string }[] }>("serper", () => doFetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": opts.apiKey, "content-type": "application/json" },
    body: JSON.stringify({ q: q.q, gl: q.country.toLowerCase(), hl: q.lang, num: 10 }),
  }));
  return (body.organic ?? []).map((o, i) => ({ url: o.link, title: o.title ?? "", snippet: o.snippet ?? "", rank: i + 1, provider: "serper", query: q.q }));
}

export async function braveSearch(q: PlannedQuery, opts: SearchOpts): Promise<SearchHit[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({ q: q.q, country: q.country, search_lang: q.lang, count: "10" });
  const body = await call<{ web?: { results?: { url: string; title?: string; description?: string }[] } }>("brave", () => doFetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { "X-Subscription-Token": opts.apiKey, accept: "application/json" },
  }));
  return (body.web?.results ?? []).map((r, i) => ({ url: r.url, title: r.title ?? "", snippet: r.description ?? "", rank: i + 1, provider: "brave", query: q.q }));
}
