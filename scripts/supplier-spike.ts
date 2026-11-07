/**
 * The supplier search spike (no UI, no database). See docs/superpowers/plans/2026-11-06-supplier-search-spike.md.
 *   npm run spike:suppliers -- smoke
 *   npm run spike:suppliers -- run [--only a,b] [--max-usd 12] [--model claude-sonnet-5-5]
 *   npm run spike:suppliers -- ai-grade [--limit 10] [--max-usd 12]
 *   npm run spike:suppliers -- score [--compare claude-haiku-5-5]
 * Output goes to docs/ui-audit/supplier-spike/ (gitignored).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spendUsd } from "../src/lib/supplierSearch/extract";
import { liveDeps, politely } from "../src/lib/supplierSearch/liveDeps";
import { applyAiGrade, gradeWithAi, type AiGrade } from "../src/lib/supplierSearch/aiGrade";
import { compareModels, gate, gradeRows, hasGrades, parseGrades, providerMap, runWarnings, scoreGrades, toCsv, type GradeRow, type ProviderMap } from "../src/lib/supplierSearch/grade";
import { braveSearch, SearchError, serperSearch, type SearchProvider } from "../src/lib/supplierSearch/search";
import { hasRetryableFetches, hashOf, Budget, runProduct, type PageStatus, type ProductRun, type SpikeDeps, type Store } from "../src/lib/supplierSearch/spikeRun";
import { manufacturersFirst, parseTestSet, type TestItem } from "../src/lib/supplierSearch/testSet";

const ROOT = "docs/ui-audit/supplier-spike";
const DEFAULT_MODEL = "claude-sonnet-5-5";
const CONCURRENCY = 3;
const PER_DOMAIN_MS = 1_000;
const RETRY_DOMAIN_MS = 5_000, RETRY_WAIT_MS = 30_000; // A slower second go at pages that said "too many requests".
let pageGapMs = PER_DOMAIN_MS;
const PER_PROVIDER_MS = 1_100; // Brave's entry plans allow about one search a second.

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
  const missing = (p: SearchProvider) => async () => { throw new SearchError(p, 401, false, "no key in .env.local"); };
  return {
    serper: serper ? (q) => politely("search:serper", () => serperSearch(q, { apiKey: serper }), PER_PROVIDER_MS) : missing("serper"),
    brave: brave ? (q) => politely("search:brave", () => braveSearch(q, { apiKey: brave }), PER_PROVIDER_MS) : missing("brave"),
  };
}

function realDeps(model: string, budget: Budget): SpikeDeps {
  return liveDeps({ model, budget, store, concurrency: CONCURRENCY, search: searchers(), pageGapMs: () => pageGapMs });
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
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error(`--max-usd must be a positive number, not "${flag(args, "max-usd")}"`);
  const only = flag(args, "only")?.split(",");
  const items = loadItems();
  if (only) for (const id of only) if (!items.some((i) => i.id === id)) throw new Error(`No product "${id}" in the test set`);
  const spentBefore = (await store.get<{ spent: number }>("budget"))?.spent ?? 0;
  const budget = new Budget(maxUsd, spentBefore);
  const deps = realDeps(model, budget);
  const firstGo: ProductRun[] = [];
  for (const item of manufacturersFirst(items).filter((i) => !only || only.includes(i.id))) {
    const r = await runProduct(item, deps);
    firstGo.push(r);
    await store.put(`runs/${model}/${item.id}`, r);
    const pages = Object.values(r.results).flat().filter(Boolean);
    console.log(`${item.id}: ${pages.length} pages, $${budget.spent.toFixed(3)} spent so far${r.partial.length ? `, partial: ${r.partial.join(", ")}` : ""}${r.stoppedForBudget ? ", budget reached" : ""}`);
    if (r.stoppedForBudget) break;
  }
  const retry = firstGo.filter((r) => !r.stoppedForBudget && hasRetryableFetches(r));
  if (retry.length) {
    console.log(`Trying the pages that failed again, more slowly, for ${retry.length} products...`);
    await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    pageGapMs = RETRY_DOMAIN_MS;
    for (const { item } of retry) await store.put(`runs/${model}/${item.id}`, await runProduct(item, deps));
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
  const { searchErrors, temporaryFailures } = runWarnings(runs);
  for (const e of searchErrors) console.log(`Search failed: ${e}`);
  if (temporaryFailures) console.log(`${temporaryFailures} pages failed for a passing reason. Run again to retry them; nothing is paid for twice.`);
}

function printStats(runs: ProductRun[]) {
  for (const provider of ["serper", "brave"] as SearchProvider[]) {
    const withProvider = runs.filter((r) => r.results[provider]);
    // A product stopped by the budget paid for only part of its pages, so it would make the average look cheap.
    const complete = withProvider.filter((r) => !r.stoppedForBudget);
    const pages = withProvider.flatMap((r) => r.results[provider] ?? []);
    if (!pages.length) { console.log(`${provider}: no results`); continue; }
    const counts: Partial<Record<PageStatus, number>> = {};
    for (const p of pages) counts[p.status] = (counts[p.status] ?? 0) + 1;
    const cost = complete.flatMap((r) => r.results[provider] ?? []).reduce((a, p) => a + p.costUsd, 0);
    const cleared: Record<string, number> = {};
    for (const p of pages) for (const c of p.extraction?.cleared ?? []) cleared[c] = (cleared[c] ?? 0) + 1;
    const queries = withProvider.reduce((a, r) => a + (r.queriesUsed[provider] ?? 0), 0);
    const hidden = withProvider.filter((r) => r.item.kind === "manufacturer").flatMap((r) => r.results[provider] ?? []).filter((p) => p.status === "snippet_only").length;
    console.log(`${provider}: ${pages.length} pages ${JSON.stringify(counts)}, ${queries} queries, AI cost per search $${(cost / Math.max(1, complete.length)).toFixed(3)}, manufacturer hits on platforms not opened: ${hidden}, prices found on ${pages.filter((p) => p.extraction?.price != null).length} of ${pages.filter((p) => p.status === "read").length} pages read, claims cleared for bad evidence: ${JSON.stringify(cleared)}`);
  }
}

/** Grades the main sheet with a different model. Answers are saved, so a re-run only pays for what's missing. */
async function aiGrade(args: string[]) {
  const model = "claude-opus-5-5";
  const maxUsd = Number(flag(args, "max-usd") ?? 12);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error(`--max-usd must be a positive number, not "${flag(args, "max-usd")}"`);
  const limit = Number(flag(args, "limit") ?? Infinity);
  const budget = new Budget(maxUsd, (await store.get<{ spent: number }>("budget"))?.spent ?? 0);
  const startedAt = budget.spent;
  const client = new Anthropic();
  const rows = parseGrades(readFileSync(sheetFor(DEFAULT_MODEL), "utf8"));
  const keyOf = (r: GradeRow) => `ai-grades/${hashOf(r.row_id)}`;
  const textOf = (url: string) => store.get<{ text: string; contact?: string | null }>(`text/${hashOf(url)}`);
  const answers = new Map<string, AiGrade>();
  for (const r of rows) { const a = await store.get<AiGrade>(keyOf(r)); if (a) answers.set(r.row_id, a); }
  // An even spread, so a --limit trial sees every kind of product.
  const todo = rows.filter((r) => !answers.has(r.row_id));
  const step = Math.max(1, Math.floor(todo.length / Math.min(limit, todo.length || 1)));
  const queue = todo.filter((_, i) => i % step === 0).slice(0, limit);
  let next = 0, failed = 0;
  const worker = async () => {
    while (next < queue.length && !budget.exhausted) {
      const row = queue[next++];
      const page = row.price_basis === "not opened" ? null : await textOf(row.url);
      const contact = page?.contact ? await textOf(page.contact) : null;
      try {
        const { grade, usage } = await gradeWithAi({ client, model, row, pageText: page?.text ?? null, contactText: contact?.text ?? null });
        budget.add(spendUsd(usage, model));
        await store.put("budget", { spent: budget.spent });
        if (grade) { answers.set(row.row_id, grade); await store.put(keyOf(row), grade); } else failed++;
      } catch (e) { failed++; console.log(`Failed: ${(e as Error).message.slice(0, 160)}`); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  writeFileSync(sheetFor(DEFAULT_MODEL), toCsv(rows.map((r) => (answers.has(r.row_id) ? applyAiGrade(r, answers.get(r.row_id)!) : r))));
  writeFileSync(join(ROOT, "ai-grade-reasons.json"), JSON.stringify(Object.fromEntries(answers), null, 1));
  const spent = budget.spent - startedAt;
  console.log(`${answers.size} of ${rows.length} rows graded by ${model}, ${failed} failed. $${spent.toFixed(3)} this run, $${(spent / Math.max(1, queue.length)).toFixed(4)} a row, $${budget.spent.toFixed(3)} in total (limit $${maxUsd}).`);
}

async function score(args: string[]) {
  const items = loadItems();
  const rows = parseGrades(readFileSync(sheetFor(DEFAULT_MODEL), "utf8"));
  const map = JSON.parse(readFileSync(join(ROOT, "provider-map.json"), "utf8")) as ProviderMap;
  const report = scoreGrades(rows, items, map);
  const runs = await savedRuns(items, DEFAULT_MODEL);
  const warnings = runWarnings(runs);
  writeFileSync(join(ROOT, "report.json"), JSON.stringify({ ...report, warnings }, null, 1));
  console.log(JSON.stringify({ ...report, warnings }, null, 1));
  console.table(gate(report).map((g) => ({ provider: g.provider, manufacturers: g.manufacturers, wholesale: g.wholesale, country: g.country })));
  for (const g of gate(report)) for (const reason of g.reasons) console.log(`${g.provider}: ${reason}`);
  if (warnings.searchErrors.length || warnings.stoppedForBudget.length || warnings.temporaryFailures) console.log("WARNING: these results are incomplete. See warnings above; a re-run retries what failed.");
  printStats(runs);
  const other = flag(args, "compare");
  if (other) console.log(`Compared with ${other}:`, compareModels(rows, parseGrades(readFileSync(sheetFor(other), "utf8"))));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "smoke") return smoke();
  if (command === "run") return run(args);
  if (command === "ai-grade") return aiGrade(args);
  if (command === "score") return score(args);
  throw new Error("Use: smoke | run [--only a,b] [--max-usd 12] [--model id] | score [--compare model]");
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
