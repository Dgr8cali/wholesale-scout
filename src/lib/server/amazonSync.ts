import "server-only";
import { computeActuals, type Actuals, type SaleDay } from "../actuals";
import { computeFees } from "../fees/engine";
import { getSpApi } from "../spapi/client";
import { salesFromOrdersReport, ukDay } from "../spapi/reports";
import { activeRateCard, chunks, db, loadProfile, must } from "./db";
import type { Purchase } from "./purchases";

/**
 * The nightly sync of Amazon's own figures for the tracker, one step per call (the watchdog
 * calls every minute; "Sync now" calls it in a loop):
 *   idle → (due: after 02:00 UK, over 20 h since the last) request the orders report(s)
 *   orders → when they're ready: sales per ASIN per day; FBA stock; Amazon's fee estimate at
 *            the price each tracked ASIN sold at → idle
 * The first sync reads 90 days (three 30-day reports: the report's limit), later ones 30.
 */

type SyncState =
  | { stage: "idle" }
  | { stage: "orders"; reports: { id: string; start: string; end: string }[]; requestedAt: string };

export interface SyncStatus {
  stage: SyncState["stage"];
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  /** Figures Amazon's permissions for this app don't allow (Buy Box %, exact fees charged). */
  missing: string[];
}

const HOUR = 3_600_000, DAY = 24 * HOUR;
const LEASE_MS = 30_000;
const ORDERS_REPORT = "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL";
/** Reports taking longer than this are given up on (and asked for again next time). */
const REPORT_TIMEOUT_MS = 2 * HOUR;
export const MISSING = [
  "Buy Box share (needs the SP-API app's Brand Analytics role)",
  "the exact fees charged per order (needs the Finance and Accounting role; Amazon's fee estimate at your selling price is used)",
];

type Row = { state: SyncState; started_at: string | null; finished_at: string | null; error: string | null; updated_at: string };

async function read(): Promise<Row> {
  const r = must(await db().from("amazon_sync").select("*").eq("id", 1).maybeSingle(), "sync") as Row | null;
  return r ?? { state: { stage: "idle" }, started_at: null, finished_at: null, error: null, updated_at: new Date(0).toISOString() };
}
async function write(patch: Partial<Omit<Row, "updated_at">>) {
  must(await db().from("amazon_sync").upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }), "sync");
}
/** One step at a time: the row's updated_at is the lease. */
async function claim(): Promise<boolean> {
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();
  const r = must(await db().from("amazon_sync").update({ updated_at: new Date().toISOString() }).eq("id", 1).lt("updated_at", cutoff).select("id"), "sync lease") as unknown[];
  return r.length > 0;
}

export async function syncStatus(): Promise<SyncStatus> {
  const r = await read();
  return { stage: r.state.stage, startedAt: r.started_at, finishedAt: r.finished_at, error: r.error, missing: MISSING };
}

const ukHour = (d = new Date()) => Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));

/** Take the sync one step further. `force` starts one now (Sync now). Returns where it stands. */
export async function advanceSync(opts: { force?: boolean } = {}): Promise<SyncStatus> {
  const sp = getSpApi();
  if (!sp) return { ...(await syncStatus()), error: "SP-API isn't set up" };
  const row = await read();
  const now = new Date();
  if (row.state.stage === "idle") {
    const due = opts.force || !row.finished_at || (now.getTime() - Date.parse(row.finished_at) > 20 * HOUR && ukHour(now) >= 2);
    if (!due || !(await claim())) return syncStatus();
    try {
      const windows = row.finished_at ? 1 : 3;
      const reports: { id: string; start: string; end: string }[] = [];
      for (let w = windows - 1; w >= 0; w--) {
        const end = new Date(now.getTime() - w * 30 * DAY);
        const start = new Date(end.getTime() - 30 * DAY);
        reports.push({ id: await sp.createReport(ORDERS_REPORT, start, end), start: start.toISOString(), end: end.toISOString() });
      }
      await write({ state: { stage: "orders", reports, requestedAt: now.toISOString() }, started_at: now.toISOString(), error: null });
    } catch (e) {
      await write({ state: { stage: "idle" }, error: `Couldn't ask for the orders report: ${(e as Error).message}` });
    }
    return syncStatus();
  }

  // Waiting on the orders report(s).
  if (!(await claim())) return syncStatus();
  const st = row.state;
  try {
    const got: { status: string; documentId: string | null }[] = [];
    for (const r of st.reports) got.push(await sp.getReport(r.id));
    if (got.some((g) => g.status === "FATAL")) throw new Error("Amazon couldn't produce the orders report");
    if (got.some((g) => g.status === "IN_QUEUE" || g.status === "IN_PROGRESS")) {
      if (now.getTime() - Date.parse(st.requestedAt) > REPORT_TIMEOUT_MS) throw new Error("The orders report took over 2 hours; it'll be asked for again");
      return syncStatus();
    }
    // Sales: the days the reports cover are replaced (cancellations and late changes included).
    const sales = [];
    for (const g of got) if (g.status === "DONE" && g.documentId) sales.push(...salesFromOrdersReport(await sp.reportText(g.documentId)));
    const from = ukDay(st.reports[0].start);
    const d = db();
    must(await d.from("amazon_sales").delete().gte("day", from), "clear sales");
    for (const c of chunks(sales, 500)) must(await d.from("amazon_sales").insert(c), "save sales");
    await syncStock();
    await syncFees();
    await write({ state: { stage: "idle" }, finished_at: new Date().toISOString(), error: null });
  } catch (e) {
    await write({ state: { stage: "idle" }, error: (e as Error).message });
  }
  return syncStatus();
}

/** FBA stock per SKU, replaced. */
async function syncStock() {
  const sp = getSpApi()!;
  const stock = await sp.fbaInventory();
  const d = db();
  must(await d.from("amazon_inventory").delete().neq("sku", ""), "clear stock");
  const at = new Date().toISOString();
  for (const c of chunks(stock, 500)) must(await d.from("amazon_inventory").insert(c.map((s) => ({ ...s, updated_at: at }))), "save stock");
}

/** Amazon's fee estimate for each tracked ASIN, at the average price it sold at in 30 days (else the predicted price). */
async function syncFees() {
  const sp = getSpApi()!;
  const d = db();
  const purchases = must(await d.from("purchases").select("asin, prediction").neq("status", "closed"), "purchases") as { asin: string; prediction: { sellPrice?: number | null } }[];
  if (!purchases.length) return;
  const since = new Date(Date.now() - 30 * DAY).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const asins = [...new Set(purchases.map((p) => p.asin))];
  const sales = must(await d.from("amazon_sales").select("asin, units, revenue").in("asin", asins).eq("channel", "Amazon").gte("day", since), "sales") as { asin: string; units: number; revenue: number }[];
  const items = asins.map((asin) => {
    const s = sales.filter((x) => x.asin === asin);
    const units = s.reduce((a, x) => a + x.units, 0);
    const price = units ? s.reduce((a, x) => a + Number(x.revenue), 0) / units : purchases.find((p) => p.asin === asin)?.prediction.sellPrice ?? null;
    return price ? { asin, price: Math.round(price * 100) / 100 } : null;
  }).filter((x): x is { asin: string; price: number } => !!x);
  if (!items.length) return;
  const est = await sp.getMyFeesEstimates(items);
  const rows = est.filter((e) => e.ok).map((e) => ({ asin: e.asin, price: items.find((i) => i.asin === e.asin)!.price, referral: e.referral, fba: e.fba, total: e.total, fetched_at: new Date().toISOString() }));
  if (rows.length) must(await d.from("amazon_fee_estimates").upsert(rows), "save fee estimates");
}

/**
 * Each purchase's actual figures: FBA sales since it went live (first in, first out across a
 * product's purchases), fees and profit through the fee engine at the price it sold at, stock.
 */
export async function actualsFor(purchases: Purchase[]): Promise<Map<string, Actuals>> {
  const out = new Map<string, Actuals>();
  if (!purchases.length) return out;
  const d = db();
  const asins = [...new Set(purchases.map((p) => p.asin))];
  const earliest = purchases.map((p) => p.ordered_on).sort()[0];
  const [sales, fees, stock, status, profile, card, products] = await Promise.all([
    d.from("amazon_sales").select("asin, day, units, revenue").in("asin", asins).eq("channel", "Amazon").gte("day", earliest).then((r) => must(r, "sales") as { asin: string; day: string; units: number; revenue: number }[]),
    d.from("amazon_fee_estimates").select("*").in("asin", asins).then((r) => must(r, "fees") as { asin: string; referral: number | null; fba: number | null }[]),
    d.from("amazon_inventory").select("asin, fulfillable, inbound, reserved").in("asin", asins).then((r) => must(r, "stock") as { asin: string; fulfillable: number; inbound: number; reserved: number }[]),
    read(),
    loadProfile(null),
    activeRateCard(),
    d.from("products").select("asin, referral_category, dims_cm, weight_g").in("asin", asins).then((r) => must(r, "products") as { asin: string; referral_category: string | null; dims_cm: { l: number; w: number; h: number } | null; weight_g: number | null }[]),
  ]);
  const a = profile.config.fees;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  for (const asin of asins) {
    const fe = fees.find((f) => f.asin === asin);
    const pr = products.find((p) => p.asin === asin);
    const item = { referralCategory: pr?.referral_category ?? null, dimsCm: pr?.dims_cm ?? null, weightG: pr?.weight_g != null ? Number(pr.weight_g) : null, goodsVatRatePct: a.vatRatePct };
    const st = stock.filter((s) => s.asin === asin);
    const byAsin = computeActuals(
      purchases.filter((p) => p.asin === asin),
      sales.filter((s) => s.asin === asin).map((s): SaleDay => ({ day: s.day, units: s.units, revenue: Number(s.revenue) })),
      {
        // Amazon's referral and FBA at the selling price, with the same DSF, VAT, storage and returns as the prediction.
        feesPerUnit: (price) => computeFees(price, item, card, a, fe?.referral != null && fe.fba != null ? { amazon: { referral: Number(fe.referral), fba: Number(fe.fba) } } : {}).totalFees,
        outputVat: (price) => (a.vatRegistered ? (price * a.vatRatePct) / (100 + a.vatRatePct) : 0),
      },
      { onHand: st.length ? st.reduce((x, s) => x + s.fulfillable + s.reserved, 0) : null, inbound: st.length ? st.reduce((x, s) => x + s.inbound, 0) : null },
      today,
      status.finished_at,
    );
    for (const [id, act] of byAsin) out.set(id, act);
  }
  return out;
}
