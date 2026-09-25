import "server-only";
import { brandKey } from "../brands";
import type { RunStats } from "../eta";
import { landedCost, type FeeAssumptions } from "../fees/engine";
import { withDefaults, type ProfileConfig } from "../screening/config";
import { conditionLabel, conditionMet, type WatchCondition, type WatchFacts } from "../watch";
import { chunks, db, must } from "./db";
import { appUrl, escapeHtml, sendEmail } from "./email";
import { addFavourite, favouritesWithLatest, listFavourites, rescreenFavourites, type Favourite } from "./favourites";

const DAY = 86_400_000;
/** A weekly re-check isn't started again within this long of the last one (unless asked). */
const WEEKLY_GAP_MS = 6 * DAY;

export interface LastCheck {
  at: string;
  verdict: "pass" | "warn" | "fail" | null;
  met: boolean;
  detail: string;
  buyBox: number | null;
  maxLanded: number | null;
  landed: number | null;
  sellers: number | null;
  runId: string;
  resultId: string | null;
}

export interface WatchAlert {
  id: string;
  favourite_id: string | null;
  ean: string;
  asin: string | null;
  title: string | null;
  kind: "passes" | "condition" | "supplier";
  detail: string;
  run_id: string | null;
  created_at: string;
  emailed_at: string | null;
}

/** Put a product on the watchlist (starring it), with its flip condition and whether it has no supplier yet. */
export async function setWatch(input: { ean: string; asin: string | null; condition: WatchCondition | null; noSupplier?: boolean }): Promise<Favourite> {
  const fav = await addFavourite(input.ean, input.asin);
  const saved = must(
    await db().from("favourites").update({ condition: input.condition, no_supplier: !!input.noSupplier, updated_at: new Date().toISOString() })
      .eq("id", fav.id).select("id, ean, asin, note, created_at, condition, no_supplier").single(),
    "watch",
  ) as Favourite;
  return saved;
}

/** Every watched product with its latest result, condition and last re-check. */
export async function watchItems() {
  const views = await favouritesWithLatest();
  const checks = new Map<string, { last_check: LastCheck | null; checked_at: string | null }>();
  for (const c of chunks(views.map((v) => v.favourite.id))) {
    for (const x of must(await db().from("favourites").select("id, last_check, checked_at").in("id", c), "checks") as { id: string; last_check: LastCheck | null; checked_at: string | null }[]) {
      checks.set(x.id, x);
    }
  }
  return views.map((v) => ({ ...v, lastCheck: checks.get(v.favourite.id)?.last_check ?? null, checkedAt: checks.get(v.favourite.id)?.checked_at ?? null }));
}

/** Alerts not yet dismissed, newest first. */
export async function openAlerts(limit = 100): Promise<WatchAlert[]> {
  const res = await db().from("watch_alerts").select("*").is("dismissed_at", null).order("created_at", { ascending: false }).limit(limit);
  if (res.error && /does not exist|schema cache/i.test(res.error.message)) return [];
  return must(res, "alerts") as WatchAlert[];
}

export async function dismissAlerts(id: string | "all"): Promise<void> {
  const q = db().from("watch_alerts").update({ dismissed_at: new Date().toISOString() });
  must(await (id === "all" ? q.is("dismissed_at", null) : q.eq("id", id)), "dismiss");
}

/**
 * Start the weekly re-check: a run of every watched product on its latest offer, screened as
 * usual (Keepa only where the snapshot is over the profile's 7-day max age; gating re-checked).
 * When it finishes, finishWatchRun records each condition and sends the digest.
 */
export async function startWatchCheck(opts: { force?: boolean } = {}): Promise<{ runId: string | null; reason?: string; count?: number }> {
  const d = db();
  if (!opts.force) {
    const recent = must(await d.from("runs").select("id, started_at").not("stats->watch", "is", null).order("started_at", { ascending: false }).limit(1), "runs") as { started_at: string }[];
    if (recent[0] && Date.now() - Date.parse(recent[0].started_at) < WEEKLY_GAP_MS) return { runId: null, reason: `re-checked ${recent[0].started_at.slice(0, 10)}` };
  }
  const favs = await listFavourites();
  if (!favs.length) return { runId: null, reason: "nothing on the watchlist" };
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  const { runId, count } = await rescreenFavourites(null, { name: `Watchlist re-check ${date}`, source: (n) => `Watchlist (${n})` });
  const run = must(await d.from("runs").select("stats").eq("id", runId).single(), "run") as { stats: RunStats | null };
  const watch: NonNullable<RunStats["watch"]> = { startedAt: new Date().toISOString() };
  must(await d.from("runs").update({ stats: { ...(run.stats ?? {}), watch } }).eq("id", runId), "run");
  return { runId, count };
}

type ResultRow = { id: string; product_id: string; offer_id: string; status: string; verdict: LastCheck["verdict"]; sell_price: number | null; inputs: Record<string, unknown> | null };

/** Best (lowest) landed cost and total stock across every costed offer for each EAN. */
async function offersByEan(eans: string[], fees: FeeAssumptions): Promise<Map<string, { landed: number | null; stock: number | null; supplier: string | null }>> {
  const d = db();
  const productEan = new Map<string, string>();
  for (const c of chunks([...new Set(eans)], 200)) {
    for (const p of must(await d.from("products").select("id, ean").in("ean", c), "products") as { id: string; ean: string }[]) productEan.set(p.id, p.ean);
  }
  const offers: { product_id: string; supplier_id: string; unit_cost_gbp: number; cost_known?: boolean; stock: number | null }[] = [];
  for (const c of chunks([...productEan.keys()], 200)) {
    offers.push(...(must(await d.from("offers").select("product_id, supplier_id, unit_cost_gbp, cost_known, stock").in("product_id", c), "offers") as typeof offers));
  }
  const suppliers = new Map<string, { name: string; vat_rate: number }>();
  for (const c of chunks([...new Set(offers.map((o) => o.supplier_id))], 200)) {
    for (const s of must(await d.from("suppliers").select("id, name, vat_rate").in("id", c), "suppliers") as { id: string; name: string; vat_rate: number }[]) suppliers.set(s.id, s);
  }
  const out = new Map<string, { landed: number | null; stock: number | null; supplier: string | null }>();
  for (const o of offers) {
    const ean = productEan.get(o.product_id)!;
    const cur = out.get(ean) ?? { landed: null, stock: null, supplier: null };
    const s = suppliers.get(o.supplier_id);
    if (o.stock != null) cur.stock = (cur.stock ?? 0) + Number(o.stock);
    if (o.cost_known !== false && Number(o.unit_cost_gbp) > 0) {
      const landed = landedCost(Number(o.unit_cost_gbp), { goodsVatRatePct: Number(s?.vat_rate ?? 20) }, fees).total;
      if (cur.landed == null || landed < cur.landed) Object.assign(cur, { landed: Math.round(landed * 100) / 100, supplier: s?.name ?? null });
    }
    out.set(ean, cur);
  }
  return out;
}

/**
 * A watchlist re-check has finished: record each item's check, raise an alert for each that
 * now passes or meets its condition (not already the case last time), and email one digest.
 * Runs once per re-check run.
 */
export async function finishWatchRun(runId: string): Promise<{ checked: number; alerts: number; emailed: boolean } | null> {
  const d = db();
  const run = must(await d.from("runs").select("stats, profile_snapshot").eq("id", runId).single(), "run") as { stats: RunStats | null; profile_snapshot: ProfileConfig };
  if (!run.stats?.watch || run.stats.watch.evaluatedAt) return null;
  const cfg = withDefaults(run.profile_snapshot);
  const favs = must(await d.from("favourites").select("id, ean, asin, condition, no_supplier, last_check"), "favourites") as
    (Favourite & { last_check: LastCheck | null })[];
  const results = must(await d.from("results").select("id, product_id, offer_id, status, verdict, sell_price, inputs").eq("run_id", runId), "results") as ResultRow[];
  const products = new Map<string, { id: string; ean: string; asin: string | null; title: string | null; brand: string | null }>();
  for (const c of chunks(results.map((r) => r.product_id), 200)) {
    for (const p of must(await d.from("products").select("id, ean, asin, title, brand").in("id", c), "products") as { id: string; ean: string; asin: string | null; title: string | null; brand: string | null }[]) products.set(p.id, p);
  }
  const approved = new Set((must(await d.from("brand_approvals").select("brand_key").eq("status", "approved"), "approvals") as { brand_key: string }[]).map((a) => a.brand_key));
  const offers = await offersByEan(favs.map((f) => f.ean), cfg.fees);

  const now = new Date().toISOString();
  const alerts: Omit<WatchAlert, "id" | "created_at" | "emailed_at">[] = [];
  let checked = 0;
  for (const f of favs) {
    const r = results.find((x) => {
      const p = products.get(x.product_id);
      return p && p.ean === f.ean && (f.asin == null || p.asin === f.asin);
    });
    if (!r) continue;
    const p = products.get(r.product_id)!;
    const i = (r.inputs ?? {}) as {
      market?: { currentBuyBox?: number | null; fbaOffers?: number | null; offersNow?: number | null; hasHistory?: boolean; amazonNow?: boolean | null; amazonLastSeenDays?: number | null } | null;
      maxLandedGbp?: number | null; restriction?: { status: string } | null;
    };
    const m = i.market ?? null;
    const o = offers.get(f.ean);
    const facts: WatchFacts = {
      verdict: r.status === "done" ? r.verdict : null,
      buyBox: m?.currentBuyBox ?? (r.sell_price != null ? Number(r.sell_price) : null),
      maxLanded: i.maxLandedGbp ?? null,
      landed: o?.landed ?? null,
      sellers: m?.fbaOffers ?? m?.offersNow ?? null,
      hasHistory: !!m?.hasHistory,
      amazonNow: !!m?.amazonNow,
      amazonLastSeenDays: m?.amazonLastSeenDays ?? null,
      brandApproved: approved.has(brandKey(p.brand)),
      gatingOpen: i.restriction?.status === "open",
      stock: o?.stock ?? null,
    };
    const c = conditionMet(f.condition, facts);
    const prev = f.last_check;
    const check: LastCheck = {
      at: now, verdict: facts.verdict, met: c.met, detail: c.detail, buyBox: facts.buyBox, maxLanded: facts.maxLanded,
      landed: facts.landed, sellers: facts.sellers, runId, resultId: r.id,
    };
    must(await d.from("favourites").update({ last_check: check, checked_at: now }).eq("id", f.id), "record check");
    checked++;
    const base = { favourite_id: f.id, ean: f.ean, asin: p.asin, title: p.title, run_id: runId };
    if (facts.verdict === "pass" && prev?.verdict !== "pass") {
      alerts.push({ ...base, kind: "passes", detail: `Now passes${prev?.verdict ? ` (was ${prev.verdict})` : ""}${facts.buyBox != null ? ` · Buy Box £${facts.buyBox.toFixed(2)}` : ""}` });
    } else if (c.met && !prev?.met) {
      alerts.push({ ...base, kind: "condition", detail: `${conditionLabel(f.condition)}: ${c.detail}` });
    }
  }
  let emailed = false;
  if (alerts.length) {
    const saved = must(await d.from("watch_alerts").insert(alerts).select("*"), "alerts") as WatchAlert[];
    emailed = (await sendDigest(saved, `Watchlist: ${saved.length} to look at`)).sent;
    if (emailed) must(await d.from("watch_alerts").update({ emailed_at: new Date().toISOString() }).in("id", saved.map((a) => a.id)), "alerts");
  }
  const fresh = must(await d.from("runs").select("stats").eq("id", runId).single(), "run") as { stats: RunStats };
  must(await d.from("runs").update({ stats: { ...fresh.stats, watch: { ...fresh.stats.watch!, evaluatedAt: now, alerts: alerts.length, emailed } } }).eq("id", runId), "run");
  return { checked, alerts: alerts.length, emailed };
}

/** One email for a set of alerts. */
async function sendDigest(alerts: WatchAlert[], subject: string) {
  const url = appUrl();
  const line = (a: WatchAlert) => `${a.title ?? a.asin ?? a.ean}: ${a.detail}`;
  const html = `<p>${escapeHtml(subject)}</p><ul>${alerts.map((a) => `<li><b>${escapeHtml(a.title ?? a.asin ?? a.ean)}</b>${a.asin ? ` (<a href="https://www.amazon.co.uk/dp/${a.asin}">${a.asin}</a>)` : ""}: ${escapeHtml(a.detail)}${a.run_id ? ` · <a href="${url}/runs/${a.run_id}">open</a>` : ""}</li>`).join("")}</ul><p><a href="${url}/watchlist">Watchlist</a></p>`;
  const text = `${subject}\n\n${alerts.map((a) => `- ${line(a)}`).join("\n")}\n\n${url}/watchlist`;
  const r = await sendEmail({ subject, html, text });
  if (!r.sent) console.warn(`[watchlist] alert email not sent: ${r.reason}`);
  return r;
}

/**
 * New offers from an upload or Qogita pull: a watched product marked "no supplier" whose EAN
 * now comes at or under its max landed cost alerts at once (the Paraflu case). The threshold is
 * its "landed ≤ £X" condition, else the max landed from its last check or latest result.
 */
export async function checkNewOffers(runId: string, offers: { ean: string; unitCostGbp: number; vatRatePct: number; supplier: string; costKnown: boolean }[], fees: FeeAssumptions): Promise<number> {
  const costed = offers.filter((o) => o.costKnown && o.unitCostGbp > 0);
  if (!costed.length) return 0;
  const d = db();
  const eans = [...new Set(costed.map((o) => o.ean))];
  const favs: (Favourite & { last_check: LastCheck | null })[] = [];
  for (const c of chunks(eans, 200)) {
    const res = await d.from("favourites").select("id, ean, asin, condition, no_supplier, last_check").eq("no_supplier", true).in("ean", c);
    if (res.error) return 0; // before the watchlist migration
    favs.push(...(res.data as typeof favs));
  }
  if (!favs.length) return 0;
  const alerts: Omit<WatchAlert, "id" | "created_at" | "emailed_at">[] = [];
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  for (const f of favs) {
    let threshold = f.condition?.kind === "landed" ? f.condition.value ?? null : f.last_check?.maxLanded ?? null;
    const product = (must(await d.from("products").select("id, asin, title").eq("ean", f.ean).order("updated_at", { ascending: false }).limit(5), "products") as { id: string; asin: string | null; title: string | null }[])
      .find((p) => f.asin == null || p.asin === f.asin);
    if (threshold == null && product) {
      const latest = (must(await d.from("results").select("inputs").eq("product_id", product.id).eq("status", "done").order("updated_at", { ascending: false }).limit(1), "result") as { inputs: { maxLandedGbp?: number | null } | null }[])[0];
      threshold = latest?.inputs?.maxLandedGbp ?? null;
    }
    if (threshold == null) continue;
    const best = costed.filter((o) => o.ean === f.ean)
      .map((o) => ({ ...o, landed: Math.round(landedCost(o.unitCostGbp, { goodsVatRatePct: o.vatRatePct }, fees).total * 100) / 100 }))
      .sort((a, b) => a.landed - b.landed)[0];
    if (!best || best.landed > threshold) continue;
    const detail = `${best.supplier} offers it at £${best.landed.toFixed(2)} landed (max £${threshold.toFixed(2)})`;
    const dup = await d.from("watch_alerts").select("id", { count: "exact", head: true }).eq("favourite_id", f.id).eq("kind", "supplier").eq("detail", detail).gte("created_at", weekAgo);
    if ((dup.count ?? 0) > 0) continue;
    alerts.push({ favourite_id: f.id, ean: f.ean, asin: product?.asin ?? f.asin, title: product?.title ?? null, kind: "supplier", detail, run_id: runId });
  }
  if (!alerts.length) return 0;
  const saved = must(await d.from("watch_alerts").insert(alerts).select("*"), "alerts") as WatchAlert[];
  const sent = await sendDigest(saved, saved.length === 1 ? `Supplier found: ${saved[0].title ?? saved[0].asin ?? saved[0].ean}` : `Suppliers found for ${saved.length} watched products`);
  if (sent.sent) must(await d.from("watch_alerts").update({ emailed_at: new Date().toISOString() }).in("id", saved.map((a) => a.id)), "alerts");
  return saved.length;
}

/** For Home: open alerts in the last 14 days. */
export async function alertCount(): Promise<number> {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const res = await db().from("watch_alerts").select("id", { count: "exact", head: true }).is("dismissed_at", null).gte("created_at", since);
  return res.error ? 0 : res.count ?? 0;
}

