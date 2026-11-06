/**
 * The supplier search spike (no UI, no database). See docs/superpowers/plans/2026-11-06-supplier-search-spike.md.
 *   npm run spike:suppliers -- smoke
 *   npm run spike:suppliers -- run [--only a,b] [--max-usd 12] [--model claude-sonnet-5-5]
 *   npm run spike:suppliers -- score [--compare claude-haiku-5-5]
 * Output goes to docs/ui-audit/supplier-spike/ (gitignored).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractCountry, extractPage, spendUsd } from "../src/lib/supplierSearch/extract";
import { safeFetch } from "../src/lib/supplierSearch/fetchGuard";
import { compareModels, gate, gradeRows, hasGrades, parseGrades, providerMap, scoreGrades, toCsv, type ProviderMap } from "../src/lib/supplierSearch/grade";
import { braveSearch, SearchError, serperSearch, type SearchProvider } from "../src/lib/supplierSearch/search";
import { Budget, runProduct, supplierDomain, type PageStatus, type ProductRun, type SpikeDeps, type Store } from "../src/lib/supplierSearch/spikeRun";
import { parseTestSet, type TestItem } from "../src/lib/supplierSearch/testSet";

const ROOT = "docs/ui-audit/supplier-spike";
const DEFAULT_MODEL = "claude-sonnet-5-5";
const CONCURRENCY = 3;
const PER_DOMAIN_MS = 1_000;

const store: Store = {
  async get<T>(key: string) {
    const file = join(ROOT, `${key}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
  },
  async put(key, value) {
    const file = join(ROOT, `${key}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  },
};

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function searchers(): SpikeDeps["search"] {
  const serper = process.env.SERPER_API_KEY, brave = process.env.BRAVE_SEARCH_API_KEY;
  if (!serper && !brave) throw new Error("Set SERPER_API_KEY and BRAVE_SEARCH_API_KEY in .env.local");
  const missing = (p: SearchProvider) => async () => { throw new SearchError(p, 0, false); };
  return {
    serper: serper ? (q) => serperSearch(q, { apiKey: serper }) : missing("serper"),
    brave: brave ? (q) => braveSearch(q, { apiKey: brave }) : missing("brave"),
  };
}

/** One request a second per domain, however many pages are being read at once. */
const nextSlot = new Map<string, number>();
async function politely<T>(url: string, go: () => Promise<T>): Promise<T> {
  const domain = supplierDomain(url) ?? url, now = Date.now();
  const at = Math.max(now, nextSlot.get(domain) ?? 0);
  nextSlot.set(domain, at + PER_DOMAIN_MS);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return go();
}

function realDeps(model: string, budget: Budget): SpikeDeps {
  const client = new Anthropic();
  return {
    model, budget, store, concurrency: CONCURRENCY, search: searchers(),
    fetchPage: (url) => politely(url, () => safeFetch(url)),
    fetchRobots: async (origin) => {
      const url = `${origin}/robots.txt`;
      const r = await politely(url, () => safeFetch(url, { anyType: true, maxBytes: 500_000 }));
      if (r.status === "ok") return r.html;
      // A server error on robots.txt means "don't crawl for now"; a missing file means no rules.
      return r.status === "http_error" && /status 5/.test(r.reason) ? "User-agent: *\nDisallow: /" : null;
    },
    extract: (productQuery, pageText, url) => extractPage({ client, model, productQuery, pageText, url }),
    extractCountry: (pageText, url) => extractCountry({ client, model, pageText, url }),
    spend: (usage) => spendUsd(usage, model),
  };
}

function loadItems(): TestItem[] {
  return parseTestSet(JSON.parse(readFileSync("scripts/supplier-spike/test-set.json", "utf8")));
}
const sheetFor = (model: string) => join(ROOT, model === DEFAULT_MODEL ? "grades.csv" : `grades-${model}.csv`);
async function savedRuns(items: TestItem[], model: string): Promise<ProductRun[]> {
  const runs = await Promise.all(items.map((i) => store.get<ProductRun>(`runs/${model}/${i.id}`)));
  return runs.filter((r): r is ProductRun => !!r);
}

async function smoke() {
  const search = searchers();
  for (const provider of Object.keys(search) as SearchProvider[]) {
    try {
      const hits = await search[provider]!({ q: "bin bags wholesale UK", country: "GB", lang: "en" });
      console.log(`${provider}: status 200, ${hits.length} results`);
    } catch (e) { console.log(`${provider}: ${(e as Error).message}`); }
  }
}

async function run(args: string[]) {
  const model = flag(args, "model") ?? DEFAULT_MODEL;
  spendUsd({ input_tokens: 0, output_tokens: 0 }, model); // Refuse a model with no known price before spending.
  const maxUsd = Number(flag(args, "max-usd") ?? 12);
  const only = flag(args, "only")?.split(",");
  const items = loadItems();
  if (only) for (const id of only) if (!items.some((i) => i.id === id)) throw new Error(`No product "${id}" in the test set`);
  const spentBefore = (await store.get<{ spent: number }>("budget"))?.spent ?? 0;
  const budget = new Budget(maxUsd, spentBefore);
  const deps = realDeps(model, budget);
  for (const item of items.filter((i) => !only || only.includes(i.id))) {
    const r = await runProduct(item, deps);
    await store.put(`runs/${model}/${item.id}`, r);
    await store.put("budget", { spent: budget.spent });
    const pages = Object.values(r.results).flat().filter(Boolean);
    console.log(`${item.id}: ${pages.length} pages, $${budget.spent.toFixed(3)} spent so far${r.partial.length ? `, partial: ${r.partial.join(", ")}` : ""}${r.stoppedForBudget ? ", budget reached" : ""}`);
    if (r.stoppedForBudget) break;
  }
  const runs = await savedRuns(items, model);
  const rows = gradeRows(runs);
  const sheet = sheetFor(model);
  // Never write over grades already filled in.
  const target = existsSync(sheet) && hasGrades(parseGrades(readFileSync(sheet, "utf8"))) ? sheet.replace(/\.csv$/, "-new.csv") : sheet;
  writeFileSync(target, toCsv(rows));
  if (model === DEFAULT_MODEL) writeFileSync(join(ROOT, "provider-map.json"), JSON.stringify(providerMap(runs), null, 1));
  console.log(`\n$${(budget.spent - spentBefore).toFixed(3)} this run, $${budget.spent.toFixed(3)} in total (limit $${maxUsd}).`);
  console.log(`${rows.length} rows in ${target}`);
  printStats(runs);
}

function printStats(runs: ProductRun[]) {
  for (const provider of ["serper", "brave"] as SearchProvider[]) {
    const withProvider = runs.filter((r) => r.results[provider]);
    const pages = withProvider.flatMap((r) => r.results[provider] ?? []);
    if (!pages.length) { console.log(`${provider}: no results`); continue; }
    const counts: Partial<Record<PageStatus, number>> = {};
    for (const p of pages) counts[p.status] = (counts[p.status] ?? 0) + 1;
    const cost = pages.reduce((a, p) => a + p.costUsd, 0);
    const queries = withProvider.reduce((a, r) => a + (r.queriesUsed[provider] ?? 0), 0);
    const hidden = withProvider.filter((r) => r.item.kind === "manufacturer").flatMap((r) => r.results[provider] ?? []).filter((p) => p.status === "snippet_only").length;
    console.log(`${provider}: ${pages.length} pages ${JSON.stringify(counts)}, ${queries} queries, AI cost per search $${(cost / withProvider.length).toFixed(3)}, manufacturer hits on platforms not opened: ${hidden}`);
  }
}

async function score(args: string[]) {
  const items = loadItems();
  const rows = parseGrades(readFileSync(sheetFor(DEFAULT_MODEL), "utf8"));
  const map = JSON.parse(readFileSync(join(ROOT, "provider-map.json"), "utf8")) as ProviderMap;
  const report = scoreGrades(rows, items, map);
  writeFileSync(join(ROOT, "report.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
  console.table(gate(report).map((g) => ({ provider: g.provider, manufacturers: g.manufacturers, wholesale: g.wholesale, country: g.country })));
  for (const g of gate(report)) for (const reason of g.reasons) console.log(`${g.provider}: ${reason}`);
  printStats(await savedRuns(items, DEFAULT_MODEL));
  const other = flag(args, "compare");
  if (other) console.log(`Compared with ${other}:`, compareModels(rows, parseGrades(readFileSync(sheetFor(other), "utf8"))));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "smoke") return smoke();
  if (command === "run") return run(args);
  if (command === "score") return score(args);
  throw new Error("Use: smoke | run [--only a,b] [--max-usd 12] [--model id] | score [--compare model]");
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
