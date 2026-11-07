import "server-only";
import { db, must } from "./db";
import { redact } from "./secrets";
import { committedUsd, effectiveSearch, type SearchKind, type SupplierSearch } from "@/lib/supplierSearch/display";
import { liveDeps, memoryStore, politely } from "@/lib/supplierSearch/liveDeps";
import { outcomeOf } from "@/lib/supplierSearch/results";
import { serperSearch } from "@/lib/supplierSearch/search";
import { Budget, runProduct } from "@/lib/supplierSearch/spikeRun";

const MODEL = "claude-sonnet-5-5"; // Haiku matched only 52% of prices in the spike.
const READABLE_PAGES = 15;
const MAX_USD_PER_SEARCH = 0.5;
const MAX_USD_PER_DAY = 5;
const SERPER_USD_PER_QUERY = 0.001;
const SEARCH_GAP_MS = 1_100;
const CONCURRENCY = 3;
/** Pages under way can take a few minutes more, so this stays well inside the 10 minutes after which a search reads as failed. */
const TIME_LIMIT_MS = 4 * 60_000;
const RECENT = 20;

const LIST_COLUMNS = "id, query, kind, status, error, cost_usd, created_at, finished_at";

/** Records a new search, or says why it can't start. The work itself is runSupplierSearch. */
export async function startSupplierSearch(req: { query: string; kind: SearchKind }): Promise<{ id: string } | { error: string; status: number }> {
  if (!process.env.SERPER_API_KEY) return { error: "Supplier search isn't set up yet: SERPER_API_KEY is missing on the server.", status: 503 };
  const d = db();
  const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
  const today = must(await d.from("supplier_searches").select("status, cost_usd, created_at, error").gte("created_at", midnight.toISOString()), "today's supplier searches") as { status: string; cost_usd: number; created_at: string; error: string | null }[];
  const committed = committedUsd(today, MAX_USD_PER_SEARCH);
  if (committed + MAX_USD_PER_SEARCH > MAX_USD_PER_DAY) return { error: `Another search could pass the $${MAX_USD_PER_DAY} daily limit: today's searches have used $${committed.toFixed(2)}, counting any still running. Try again tomorrow.`, status: 429 };
  const row = must(await d.from("supplier_searches").insert({ query: req.query, kind: req.kind }).select("id").single(), "new supplier search") as { id: string };
  return { id: row.id };
}

/** Never throws: it runs after the response has gone, so a failure is written to the row. */
export async function runSupplierSearch(id: string, req: { query: string; kind: SearchKind }): Promise<void> {
  const d = db();
  const budget = new Budget(MAX_USD_PER_SEARCH);
  try {
    const apiKey = process.env.SERPER_API_KEY!;
    const run = await runProduct({ id, query: req.query, kind: req.kind === "manufacturer" ? "manufacturer" : "generic" }, liveDeps({
      model: MODEL, budget, concurrency: CONCURRENCY, readablePerProvider: READABLE_PAGES, deadlineAt: Date.now() + TIME_LIMIT_MS,
      // Written as it's spent: a deploy can restart the app part-way, and the daily limit still has to count it.
      store: memoryStore(async (usd) => { const { error } = await d.from("supplier_searches").update({ cost_usd: usd }).eq("id", id); if (error) throw new Error(error.message); }),
      search: { serper: (q) => politely("search:serper", () => serperSearch(q, { apiKey }), SEARCH_GAP_MS) },
    }));
    const o = outcomeOf(run, req.kind);
    const cost = budget.spent + (run.queriesUsed.serper ?? 0) * SERPER_USD_PER_QUERY;
    must(await d.from("supplier_searches").update({ status: o.status, error: o.error, results: o.rows, stats: o.stats, warnings: o.warnings, cost_usd: cost, finished_at: new Date().toISOString() }).eq("id", id).select("id"), "finished supplier search");
  } catch (e) {
    const error = redact(e instanceof Error ? e.message : String(e)).slice(0, 300);
    console.error(`supplier search ${id}: ${error}`);
    await d.from("supplier_searches").update({ status: "failed", error: "The search stopped unexpectedly. Run it again.", cost_usd: budget.spent, finished_at: new Date().toISOString() }).eq("id", id);
  }
}

export async function recentSupplierSearches() {
  const rows = must(await db().from("supplier_searches").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(RECENT), "supplier searches") as unknown as Omit<SupplierSearch, "results" | "stats" | "warnings">[];
  return rows.map((r) => effectiveSearch(r));
}

export async function getSupplierSearch(id: string): Promise<SupplierSearch | null> {
  const { data, error } = await db().from("supplier_searches").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`supplier search: ${error.message}`);
  return data ? effectiveSearch(data as SupplierSearch) : null;
}
