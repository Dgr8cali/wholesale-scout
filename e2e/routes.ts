/**
 * Every page the app has (each tab its own view), for the accessibility and phone checks. Detail
 * pages use a real record, looked up through the app's own API (the first run, product, brand,
 * supplier and candidate it lists).
 */
import type { APIRequestContext } from "@playwright/test";

export interface Route { name: string; path: string }

const STATIC: Route[] = [
  { name: "Today", path: "/" },
  { name: "Runs", path: "/runs" },
  ...["upload", "check", "qogita", "hunt", "seller"].map((t) => ({ name: `New run · ${t}`, path: `/new-run?tab=${t}` })),
  { name: "Products", path: "/products" },
  { name: "Suppliers", path: "/suppliers" },
  ...["products", "watching"].map((t) => ({ name: `Shortlist · ${t}`, path: `/shortlist?tab=${t}` })),
  { name: "Sellers", path: "/sellers" },
  { name: "Brands", path: "/brands" },
  { name: "Plan", path: "/plan" },
  { name: "Pipeline", path: "/pl" },
  { name: "Candidates", path: "/pl/candidates" },
  ...["mine", "find"].map((t) => ({ name: `Niches · ${t}`, path: `/pl/niches?tab=${t}` })),
  ...["suppliers", "quotes"].map((t) => ({ name: `Suppliers & quotes · ${t}`, path: `/pl/suppliers?tab=${t}` })),
  ...["overview", "imports"].map((t) => ({ name: `Ads dashboard · ${t}`, path: `/ads/dashboard?tab=${t}` })),
  ...["review", "exports"].map((t) => ({ name: `Proposals · ${t}`, path: `/ads/proposals?tab=${t}` })),
  { name: "Launch", path: "/ads/launch" },
  ...["keywords", "ngrams", "all"].map((t) => ({ name: `Search terms · ${t}`, path: `/ads/search-terms?tab=${t}` })),
  ...["rules", "settings"].map((t) => ({ name: `Rules · ${t}`, path: `/ads/rules?tab=${t}` })),
  { name: "Review", path: "/ads/review" },
  { name: "Stock levels", path: "/stock/levels" },
  { name: "Purchases", path: "/stock/purchases" },
  { name: "Reorder", path: "/stock/reorder" },
  { name: "Sales", path: "/stock/sales" },
  { name: "Movements", path: "/stock/movements" },
  { name: "Stock import", path: "/stock/import" },
  ...["business", "gates", "score", "fees", "profiles", "waived", "ip", "filters", "pl", "stock", "appearance"].map((t) => ({ name: `Settings · ${t}`, path: `/settings?tab=${t}` })),
  { name: "Help", path: "/help" },
  { name: "Help article", path: "/help/pages/runs" },
  { name: "Not found", path: "/no-such-page" },
];

async function json<T>(request: APIRequestContext, path: string): Promise<T | null> {
  const r = await request.get(path);
  return r.ok() ? ((await r.json()) as T) : null;
}

/** Every route, the detail pages with a real record each. */
export async function allRoutes(request: APIRequestContext): Promise<Route[]> {
  const out = [...STATIC];
  const runs = await json<{ runs: { id: string; status: string }[] }>(request, "/api/runs");
  const run = runs?.runs.find((r) => r.status === "done");
  if (run) out.push({ name: "Run detail", path: `/runs/${run.id}` });
  const products = await json<{ items: { asin: string }[] }>(request, "/api/products?size=10");
  if (products?.items[0]) out.push({ name: "Product page", path: `/products/${products.items[0].asin}` });
  const brands = await json<{ brands?: { key: string }[] } | { key: string }[]>(request, "/api/brands");
  const brand = Array.isArray(brands) ? brands[0] : brands?.brands?.[0];
  if (brand) out.push({ name: "Brand detail", path: `/brands/${encodeURIComponent(brand.key)}` });
  const suppliers = await json<{ suppliers?: { id: string }[] } | { id: string }[]>(request, "/api/suppliers");
  const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers?.suppliers?.[0];
  if (supplier) out.push({ name: "Supplier detail", path: `/suppliers/${supplier.id}` });
  const cands = await json<{ candidates?: { id: string }[] } | { id: string }[]>(request, "/api/pl/candidates");
  const cand = Array.isArray(cands) ? cands[0] : cands?.candidates?.[0];
  if (cand) for (const t of ["overview", "gates", "reviews", "suppliers", "listing", "launch"]) out.push({ name: `Candidate · ${t}`, path: `/pl/candidates/${cand.id}?tab=${t}` });
  // The supplier comparison, on the candidate with the most quotes.
  const ov = await json<{ candidates: { id: string; quotes: number }[] }>(request, "/api/pl/overview");
  const quoted = ov?.candidates.filter((c) => c.quotes > 0).sort((a, b) => b.quotes - a.quotes)[0];
  if (quoted) out.push({ name: "Candidate · compare quotes", path: `/pl/candidates/${quoted.id}?tab=suppliers&quotes=compare` });
  return out;
}
