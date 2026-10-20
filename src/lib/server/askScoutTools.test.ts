import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests, activeRateCard } from "./db";
import { FakeDb } from "./fakeDb";
import { TOOLS, runTool } from "./askScoutTools";

const NOW = new Date("2026-10-20T09:00:00Z");
const WRITES = ["insert", "upsert", "update", "delete"] as const;

/** A FakeDb that records every write, and every rpc (which it doesn't support). */
function recordingDb() {
  const db = new FakeDb();
  const writes: string[] = [];
  const from = db.from.bind(db);
  db.from = (table: string) => {
    const b = from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const w of WRITES) {
      const orig = b[w].bind(b);
      b[w] = (...a: unknown[]) => { writes.push(`${w} ${table}`); return orig(...a); };
    }
    return b as never;
  };
  (db as unknown as { rpc: (n: string) => never }).rpc = (n: string) => { writes.push(`rpc ${n}`); throw new Error("rpc"); };
  return { db, writes };
}

describe("Ask Scout tools are read-only", () => {
  let rec: ReturnType<typeof recordingDb>;
  beforeEach(() => {
    rec = recordingDb();
    const t = rec.db.tables;
    t.ads_products = [{ asin: "B0HM8FBX3T", title: "Dog Seat Belt for Car, 2 Pack", price: 12.99, landed_cost: 3.66, phase: "launch" }];
    t.ads_campaigns = [{ id: "c1", name: "B0HM8FBX3T Auto", asin: "B0HM8FBX3T", state: "enabled", archived: false }];
    t.ads_campaign_ranges = [{ id: "r1", campaign: "c1", source: "bulk", date_from: "2026-09-19", date_to: "2026-10-18", impressions: 5000, clicks: 80, cost: 30, orders: 6, sales: 77.94, units: 6 }];
    t.amazon_sales = [{ asin: "B0HM8FBX3T", day: "2026-10-10", channel: "Amazon.co.uk", units: 3, orders: 3, revenue: 38.97 }];
    t.stock_items = [{ id: "i1", sku: "KC-BELT-2PK", name: "Dog Seat Belt 2 Pack", asin: "B0HM8FBX3T", status: "active", unit_cost: 1.31, reorder_level: 10, lead_time_days: 21, archived_at: null, created_at: "2026-10-01" }];
    t.purchases = [{ id: "p1", asin: "B0HM8FBX3T", stock_item_id: "i1", supplier_name: "Ningbo", units: 500, unit_cost_gbp: 1.31, landed_gbp: 3.66, status: "received", ordered_on: "2026-09-01", status_dates: {} }];
    t.pl_candidates = [{ id: "pc1", name: "Lens cleaning wipes", niche_keyword: "lens wipes", category: "Everything else", status: "researching", created_at: "2026-10-01", updated_at: "2026-10-13" }];
    t.pl_supplier_leads = [{ id: "l1", candidate_id: "pc1", supplier_name: "Xiaocao Electronic", title: "Lens wipes", score: 88, status: "contacted", updated_at: "2026-10-05T23:42:56Z", listing_url: "u" }];
    t.pl_quotes = [{ id: "q1", candidate_id: "pc1", supplier_name: "Xiaocao Electronic", unit_price: 0.05, currency: "USD", moq: 1000, status: "requested", updated_at: "2026-10-06T00:00:00Z" }];
    t.suppliers = [{ id: "s1", name: "Qogita UK", kind: "wholesaler", mov: 100, currency: "GBP", delivery_days: 3, rating: 4 }];
    t.ads_proposals = [{ id: "x1", asin: "B0HM8FBX3T", rule: "bid_down", campaign_name: "Auto", entity: { label: "close-match" }, current_value: "£0.45", proposed_value: "£0.36", reason: "12 clicks, no order", confidence: "medium", clicks: 12, orders: 0, status: "open", created_at: "2026-10-03T00:00:00Z" }];
  });
  afterEach(() => __setDbForTests(null));
  /** The app's first-run defaults (profiles, rules, rate card) go into an empty database once; a set-up one has them. */
  const setUp = async () => { __setDbForTests(rec.db); await activeRateCard(); rec.writes.length = 0; };

  const inputs: Record<string, Record<string, unknown>> = {
    find_products: { query: "seat belt" },
    product_metrics: { asin: "B0HM8FBX3T", from: "2026-10-01", to: "2026-10-20" },
    stock: { query: "belt" },
    candidates: { query: "lens" },
    suppliers: { status: "contacted" },
    proposals: {},
  };

  it("every tool has a test input", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(inputs).sort());
  });

  for (const [name, input] of Object.entries(inputs)) {
    it(`${name} answers from the data and writes nothing`, async () => {
      await setUp();
      const r = await runTool(name, input, NOW);
      expect(r.data, JSON.stringify(r.data)).not.toHaveProperty("error");
      expect(rec.writes).toEqual([]);
      expect(r.links.every((l) => l.href.startsWith("/"))).toBe(true);
    });
  }

  it("the answers carry the real figures", async () => {
    await setUp();
    const found = await runTool("find_products", { query: "seat belt" }, NOW);
    expect((found.data as { found: { asin: string }[] }).found.map((f) => f.asin)).toContain("B0HM8FBX3T");
    const sup = await runTool("suppliers", { status: "contacted" }, NOW);
    expect((sup.data as { alibabaLeads: { supplier: string; lastChanged: string }[] }).alibabaLeads).toEqual([expect.objectContaining({ supplier: "Xiaocao Electronic", lastChanged: "2026-10-05" })]);
    const m = await runTool("product_metrics", { asin: "B0HM8FBX3T", from: "2026-10-01", to: "2026-10-20" }, NOW);
    expect((m.data as { amazonSales: { byChannel: Record<string, { units: number }> } }).amazonSales.byChannel["Amazon.co.uk"].units).toBe(3);
    expect(rec.writes).toEqual([]);
  });

  it("an unknown tool is an error, not a call", async () => {
    await setUp();
    expect((await runTool("delete_everything", {}, NOW)).data).toEqual({ error: "No tool called delete_everything" });
    expect(rec.writes).toEqual([]);
  });

  it("the tools' source has no write, rpc, upload or outside call", () => {
    // The code, comments left out.
    const src = readFileSync(join(__dirname, "askScoutTools.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/\.(insert|upsert|update|delete|rpc)\(/);
    expect(src).not.toMatch(/\bfetch\(|spapi|keepa\/client|getKeepa|adsOps|bulk|upload|scheduleCall/i);
    // Only these modules: types, pure helpers and the read helpers.
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["../ads/rules", "../pl/adsDefaults", "../pl/gatekeeper", "../pl/launch", "./ads", "./db", "./pl", "./stock", "@anthropic-ai/sdk"].sort());
    expect(src).toMatch(/import \{ adsDashboard \} from "\.\/ads"/);
    expect(src).toMatch(/import \{ db, must, selectAll \} from "\.\/db"/);
    expect(src).toMatch(/import \{ listCandidates \} from "\.\/pl"/);
    expect(src).toMatch(/import \{ stockLevels \} from "\.\/stock"/);
  });

  it("no tool's description or schema offers a change", () => {
    for (const t of TOOLS) expect(`${t.name} ${t.description}`).not.toMatch(/\b(create|set|change|update|delete|upload|approve|send)\b/i);
  });
});
