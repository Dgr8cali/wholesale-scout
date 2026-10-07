import "server-only";
import { nicheLedgers, nicheSummary } from "./plNiches";
import { supplierSummary } from "./plSuppliers";
import { businessSettings } from "./business";
import { LAUNCH_STEPS } from "../pl/launch";
import { addDailyTokens, PL_KEEP_DAYS, ukDay, type TokensByDay } from "../keepaLedger";
import { getKeepa, type KeepaProduct, type OnKeepaResponse, type Point } from "../keepa/client";
import { rankDrops } from "../keepa/summarize";
import { isAmazonBrand } from "../pl/amazon-brands";
import { defaultReference, GATE2_KEYS, keepaFill, type Fill, type PlAsin, type PlHistory } from "../pl/fill";
import { DEFAULT_SETTINGS, evaluate, FIELD_KEYS, GATES, priceBand, SETTINGS_DEF, type Settings, type Waiver } from "../pl/gatekeeper";
import { bbTrend, offerTrend, rankTrend } from "../pl/history";
import { extractPoe, poeFill, unreadFields, type PoeExtract } from "../pl/poe";
import { activeRateCard, db, must, selectAll } from "./db";
import { adsSettings } from "./ads";
import { withAdsDefaults } from "../pl/adsDefaults";
import { saveSnapshot } from "./process";

/**
 * Private label (Gatekeeper) candidates: their page-one ASINs with a Keepa snapshot each, one row
 * per Gatekeeper field with its source, and Opportunity Explorer captures. Automatic fills (Keepa,
 * Opportunity Explorer) never overwrite a field you typed.
 */

const DAY = 86_400_000;
/** A snapshot this recent is reused instead of asking Keepa again (the wholesale default). */
const REUSE_MS = 7 * DAY;

export const STATUSES = ["draft", "researching", "samples", "parked", "dropped", "launched"] as const;
export type PlStatus = (typeof STATUSES)[number];
/** poe_derived: worked out from a capture rather than read off it ("POE (derived)"). */
export type FieldSource = "keepa" | "poe" | "poe_derived" | "manual" | "fees" | "quote";

export interface PlCandidate {
  id: string; name: string; niche_keyword: string | null; category: string; status: PlStatus; notes: string | null;
  token_cost: number; keepa_by_day: TokensByDay; refreshed_at: string | null; created_at: string; updated_at: string;
  listing_asin?: string | null; chosen_quote?: string | null; chosen_landed?: number | null;
  /** You picked Gate 2's reference listing: refreshes keep it (else the longest Keepa history wins). */
  reference_pinned?: boolean;
  /** Parked: shelved with a reason (and the status to go back to). */
  park_reason?: string | null; parked_at?: string | null; parked_from?: string | null;
}
export interface PlField { value: string; source: FieldSource; updated_at: string }
export interface PoeSnapshot extends Omit<PoeExtract, "niche_id" | "niche_title"> { id: string; candidate_id: string | null; niche_id: string | null; niche_title: string | null; captured_at: string }

const isAsin = (s: string) => /^[A-Z0-9]{10}$/.test(s);

/** ASINs pasted one per line or comma-separated, de-duplicated, first ten. */
export function parseAsins(text: string): string[] {
  const all = text.toUpperCase().split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const a of all) {
    const m = a.match(/(?:\/DP\/|^)([A-Z0-9]{10})(?:\b|$)/);
    const asin = m?.[1] ?? a;
    if (isAsin(asin) && !out.includes(asin)) out.push(asin);
  }
  return out.slice(0, 10);
}

/* ===================== reads ===================== */

const ASIN_COLS = "candidate_id, asin, position, is_reference, title, brand, image, price, rating, review_count, rank, avg_rank_90d, rank_drops_90d, bought_past_month, offer_count, buybox_price, amazon_ever_seller, amazon_brand, dimensions, weight, first_seen, history, snapshot_at";
const POE_COLS = "id, candidate_id, niche_id, niche_title, captured_at, search_volume_360, search_volume_growth, search_volume_growth_source, search_volume_growth_90, search_volume_growth_360, products_in_niche, top3_click_share, search_conversion, search_conversion_source, avg_units_per_product, search_terms";

const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const asinRow = (r: Record<string, unknown>): PlAsin => ({
  ...(r as unknown as PlAsin),
  price: numOrNull(r.price), rating: numOrNull(r.rating), buybox_price: numOrNull(r.buybox_price),
});

export async function plSettings(): Promise<Settings> {
  const res = await db().from("pl_settings").select("key, value");
  const rows = (must(res, "private label settings") as { key: string; value: number }[]);
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in out) out[r.key as keyof Settings] = Number(r.value);
  // VAT registration and rate are the business's (Settings → Business).
  const b = await businessSettings();
  return { ...out, vat: b.vatRate, vatRegistered: b.vatRegistered ? 1 : 0 };
}

export async function savePlSettings(input: Partial<Record<string, unknown>>): Promise<Settings> {
  const rows = SETTINGS_DEF.filter((s) => input[s.k] != null && Number.isFinite(Number(input[s.k])))
    .map((s) => ({ key: s.k, value: Number(input[s.k]), updated_at: new Date().toISOString() }));
  if (rows.length) must(await db().from("pl_settings").upsert(rows, { onConflict: "key" }), "save settings");
  return plSettings();
}

async function fieldsOf(ids: string[]): Promise<Map<string, Record<string, PlField>>> {
  const out = new Map<string, Record<string, PlField>>(ids.map((id) => [id, {}]));
  if (!ids.length) return out;
  // About 60 fields a candidate: past 1,000 with a few dozen candidates, so read a page at a time.
  const rows = await selectAll<{ candidate_id: string; key: string } & PlField>("pl_candidate_fields", "candidate_id, key, value, source, updated_at", ["candidate_id", "key"], (q) => q.in("candidate_id", ids));
  for (const r of rows) if (r.value != null) out.get(r.candidate_id)![r.key] = { value: r.value, source: r.source, updated_at: r.updated_at };
  return out;
}

const WAIVER_COLS = "id, candidate_id, gate_id, check_label, reason, created_at";

async function waiversOf(ids: string[]): Promise<Map<string, Waiver[]>> {
  const out = new Map<string, Waiver[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const rows = await selectAll<Waiver & { candidate_id: string }>("pl_gate_waivers", WAIVER_COLS, ["created_at", "id"], (q) => q.in("candidate_id", ids)).catch(() => null);
  if (!rows) return out; // before the migration
  for (const w of rows) out.get(w.candidate_id)?.push(w);
  return out;
}

/** Waive one check of a gate (by its label) or, with no label, the whole gate. A reason is required. */
export async function addWaiver(candidateId: string, input: { gate_id?: string; check_label?: string | null; reason?: string }): Promise<Waiver> {
  const gate = GATES.find((g) => g.id === input.gate_id);
  if (!gate) throw new Error("gate_id must be g0–g7");
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Give a reason for the waiver");
  const label = input.check_label?.trim() || null;
  const d = db();
  // One waiver per check (or gate): a second replaces the first's reason.
  const cur = must(await d.from("pl_gate_waivers").select("id").eq("candidate_id", candidateId).eq("gate_id", gate.id)[label ? "eq" : "is"]("check_label", label), "waiver") as { id: string }[];
  const row = cur[0]
    ? must(await d.from("pl_gate_waivers").update({ reason: reason.slice(0, 300) }).eq("id", cur[0].id).select(WAIVER_COLS).single(), "waiver")
    : must(await d.from("pl_gate_waivers").insert({ candidate_id: candidateId, gate_id: gate.id, check_label: label, reason: reason.slice(0, 300) }).select(WAIVER_COLS).single(), "waiver");
  must(await d.from("pl_candidates").update({ updated_at: now() }).eq("id", candidateId), "touch candidate");
  return row as Waiver;
}

export async function removeWaiver(candidateId: string, waiverId: string) {
  must(await db().from("pl_gate_waivers").delete().eq("id", waiverId).eq("candidate_id", candidateId), "remove waiver");
}

/** Every candidate with its fields and waivers (the list scores them), newest first. */
export async function listCandidates() {
  const [rows, settings, card, ads] = await Promise.all([
    db().from("pl_candidates").select("*").order("created_at", { ascending: false }),
    plSettings(),
    activeRateCard(),
    adsSettings(),
  ]);
  const candidates = must(rows, "candidates") as PlCandidate[];
  const ids = candidates.map((c) => c.id);
  const [fields, waivers, steps] = await Promise.all([
    fieldsOf(ids), waiversOf(ids),
    ids.length ? db().from("pl_launch_steps").select("candidate_id, step, done").in("candidate_id", ids).then((r) => (r.data ?? []) as { candidate_id: string; step: string; done: boolean }[]) : Promise.resolve([]),
  ]);
  // The next launch step, for the list.
  const next = (id: string) => { const done = new Set(steps.filter((x) => x.candidate_id === id && x.done).map((x) => x.step)); return { next: LAUNCH_STEPS.find((x) => !done.has(x.key))?.label ?? null, done: done.size }; };
  // adsCpc: the CPC the ads-per-unit defaults use (Settings → Ads; the account's once imported).
  return { candidates: candidates.map((c) => ({ ...c, chosen_landed: c.chosen_landed == null ? null : Number(c.chosen_landed), fields: fields.get(c.id) ?? {}, waivers: waivers.get(c.id) ?? [], launch: next(c.id) })), settings, card, adsCpc: ads.cpc };
}

export async function getCandidate(id: string) {
  const d = db();
  const [c, asins, poe] = await Promise.all([
    d.from("pl_candidates").select("*").eq("id", id).maybeSingle(),
    d.from("pl_candidate_asins").select(ASIN_COLS).eq("candidate_id", id).order("position"),
    d.from("pl_poe_snapshots").select(POE_COLS).eq("candidate_id", id).order("captured_at", { ascending: false }).limit(1),
  ]);
  const candidate = must(c, "candidate") as PlCandidate | null;
  if (!candidate) return null;
  const list = (must(asins, "asins") as Record<string, unknown>[]).map(asinRow);
  const latestPoe = ((must(poe, "poe") as PoeSnapshot[])[0]) ?? null;
  const fields = (await fieldsOf([id])).get(id) ?? {};
  const waivers = (await waiversOf([id])).get(id) ?? [];
  // Why each automatic value is what it is, worked out again from the stored data.
  const why: Record<string, string> = {};
  for (const [k, v] of Object.entries(keepaFill(list, priceBand(valuesOfFields(fields))))) why[k] = v.why;
  if (latestPoe) for (const [k, v] of Object.entries(poeFill(latestPoe as unknown as PoeExtract))) why[k] = v.why;
  const ref = list.find((a) => a.is_reference) ?? list[0];
  return { candidate, fields, asins: list, poe: latestPoe, why, waivers, refRank: ref ? await rankYear(ref.asin) : null };
}

/**
 * The reference listing's sales rank over the last 12 months, for Gate 2's sparkline: from the
 * newest stored Keepa series (no Keepa call), one point a week (the week's last reading).
 */
async function rankYear(asin: string): Promise<{ asin: string; points: Point[]; fetchedAt: string } | null> {
  const r = (await db().from("keepa_snapshots").select("rank_series, fetched_at").eq("asin", asin).order("fetched_at", { ascending: false }).limit(1).maybeSingle()).data as { rank_series: Point[] | null; fetched_at: string } | null;
  if (!r?.rank_series?.length) return null;
  const since = Date.now() - 365 * DAY;
  const week = new Map<number, Point>();
  for (const [t, v] of r.rank_series) if (t >= since && Number.isFinite(v) && v > 0) week.set(Math.floor(t / (7 * DAY)), [t, v]);
  const points = [...week.values()].sort((a, b) => a[0] - b[0]);
  return points.length ? { asin, points, fetchedAt: r.fetched_at } : null;
}

/* ===================== writes ===================== */

const now = () => new Date().toISOString();

export async function createCandidate(input: { name: string; niche_keyword?: string | null; category?: string | null; asins: string[] }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Give the candidate a name");
  const asins = input.asins.filter(isAsin).slice(0, 10);
  const row = must(await db().from("pl_candidates").insert({
    name: name.slice(0, 120),
    niche_keyword: input.niche_keyword?.trim().slice(0, 200) || null,
    category: input.category?.trim() || "Everything else",
    status: asins.length ? "researching" : "draft",
  }).select("*").single(), "create candidate") as PlCandidate;
  if (asins.length) {
    must(await db().from("pl_candidate_asins").insert(asins.map((asin, i) => ({ candidate_id: row.id, asin, position: i + 1, is_reference: i === 0 }))), "add ASINs");
  }
  return row;
}

/**
 * Name, niche keyword, category, status, notes, park reason. Parking needs a reason and remembers
 * the status it left; any other status clears the parking ("unpark" goes back to that status).
 */
export async function updateCandidate(id: string, patch: Partial<Pick<PlCandidate, "name" | "niche_keyword" | "category" | "status" | "notes" | "park_reason">> & { unpark?: boolean }) {
  const upd: Record<string, unknown> = { updated_at: now() };
  if (patch.name != null) upd.name = String(patch.name).trim().slice(0, 120) || "Untitled";
  if (patch.niche_keyword !== undefined) upd.niche_keyword = patch.niche_keyword?.trim() || null;
  if (patch.category != null) upd.category = String(patch.category);
  if (patch.status != null) {
    if (!STATUSES.includes(patch.status)) throw new Error(`Status must be one of ${STATUSES.join(", ")}`);
    upd.status = patch.status;
  }
  const cur = patch.status != null || patch.unpark || patch.park_reason !== undefined
    ? must(await db().from("pl_candidates").select("status, parked_from").eq("id", id).single(), "candidate") as { status: PlStatus; parked_from: string | null }
    : null;
  if (patch.unpark && cur?.status === "parked") {
    upd.status = STATUSES.includes(cur.parked_from as PlStatus) && cur.parked_from !== "parked" ? cur.parked_from : "researching";
  }
  if (upd.status === "parked") {
    const reason = patch.park_reason?.trim();
    if (cur?.status !== "parked") {
      if (!reason) throw new Error("Give a reason to park it");
      Object.assign(upd, { park_reason: reason.slice(0, 500), parked_at: now(), parked_from: cur?.status ?? null });
    } else if (reason) upd.park_reason = reason.slice(0, 500);
  } else if (upd.status != null) {
    Object.assign(upd, { park_reason: null, parked_at: null, parked_from: null });
  } else if (patch.park_reason !== undefined && cur?.status === "parked" && patch.park_reason?.trim()) {
    upd.park_reason = patch.park_reason.trim().slice(0, 500);
  }
  if (patch.notes !== undefined) upd.notes = patch.notes || null;
  must(await db().from("pl_candidates").update(upd).eq("id", id), "update candidate");
}

/**
 * Replace the candidate's ASIN list; snapshots of kept ASINs stay. The reference you picked stays
 * when it's still in the list; otherwise the first is the reference until the next refresh picks
 * the one with the longest Keepa history.
 */
export async function setAsins(id: string, asins: string[]) {
  const list = asins.filter(isAsin).slice(0, 10);
  const d = db();
  const cur = must(await d.from("pl_candidate_asins").select("asin, is_reference").eq("candidate_id", id), "asins") as { asin: string; is_reference: boolean }[];
  const pinned = ((await d.from("pl_candidates").select("reference_pinned").eq("id", id).maybeSingle()).data as { reference_pinned?: boolean } | null)?.reference_pinned ?? false;
  const keep = pinned ? cur.find((r) => r.is_reference && list.includes(r.asin))?.asin ?? null : null;
  if (pinned && !keep) must(await d.from("pl_candidates").update({ reference_pinned: false }).eq("id", id), "unpin reference");
  const drop = cur.map((r) => r.asin).filter((a) => !list.includes(a));
  if (drop.length) must(await d.from("pl_candidate_asins").delete().eq("candidate_id", id).in("asin", drop), "remove ASINs");
  // Gate 4's reviews follow: a removed ASIN's are kept and marked removed; an added one's unmarked.
  if (drop.length) must(await d.from("pl_review_dumps").update({ removed_at: now() }).eq("candidate_id", id).in("asin", drop), "mark removed reviews");
  if (list.length) must(await d.from("pl_review_dumps").update({ removed_at: null, kept_separate: false }).eq("candidate_id", id).in("asin", list), "unmark reviews");
  if (list.length) {
    // Positions are unique per candidate only by convention; upsert by (candidate, asin).
    must(await d.from("pl_candidate_asins").upsert(list.map((asin, i) => ({ candidate_id: id, asin, position: i + 1, is_reference: keep ? asin === keep : i === 0 })), { onConflict: "candidate_id,asin" }), "save ASINs");
  }
}

export async function deleteCandidate(id: string) {
  must(await db().from("pl_candidates").delete().eq("id", id), "delete candidate");
}

/** You typed it: a manual row, which no refresh overwrites. An empty value removes the row (automatic fills may then fill it again). */
const valuesOfFields = (m: Record<string, PlField>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.value]));

/** The candidate's target price band (Gate 0), else £18–35. */
async function bandOf(id: string) {
  return priceBand(valuesOfFields((await fieldsOf([id])).get(id) ?? {}));
}

/**
 * Gate 1's "price spread holds the band" again after the target band changes: from the stored
 * page-one prices (no Keepa), never over your own answer.
 */
export async function refreshPriceTight(id: string): Promise<string[]> {
  const asins = (must(await db().from("pl_candidate_asins").select(ASIN_COLS).eq("candidate_id", id).order("position"), "asins") as Record<string, unknown>[]).map(asinRow);
  const fill = keepaFill(asins, await bandOf(id));
  return fill.priceTight ? applyAuto(id, { priceTight: fill.priceTight }, "keepa") : [];
}

export async function setField(id: string, key: string, value: string | null) {
  if (!FIELD_KEYS.has(key)) throw new Error(`Unknown field ${key}`);
  const d = db();
  if (value == null || String(value).trim() === "") must(await d.from("pl_candidate_fields").delete().eq("candidate_id", id).eq("key", key), "clear field");
  else must(await d.from("pl_candidate_fields").upsert({ candidate_id: id, key, value: String(value).slice(0, key === "spec" ? 4000 : 200), source: "manual", updated_at: now() }, { onConflict: "candidate_id,key" }), "save field");
  must(await d.from("pl_candidates").update({ updated_at: now() }).eq("id", id), "touch candidate");
}

/** Write automatic values, skipping every field whose row is manual. Returns the keys written. */
export async function applyAuto(id: string, fill: Fill, source: Exclude<FieldSource, "manual" | "poe_derived">): Promise<string[]> {
  const d = db();
  const manual = new Set((must(await d.from("pl_candidate_fields").select("key").eq("candidate_id", id).eq("source", "manual"), "manual fields") as { key: string }[]).map((r) => r.key));
  const rows = Object.entries(fill).filter(([k]) => FIELD_KEYS.has(k) && !manual.has(k))
    .map(([key, v]) => ({ candidate_id: id, key, value: v.value, source: v.source ?? source, updated_at: now() }));
  if (rows.length) must(await d.from("pl_candidate_fields").upsert(rows, { onConflict: "candidate_id,key" }), "auto fill");
  return rows.map((r) => r.key);
}

/* ===================== Keepa ===================== */

/** The stored snapshot for one ASIN, from a Keepa product. */
export function snapshotOf(k: KeepaProduct, at = Date.now()) {
  const s = k.summary;
  const bb = s.buyBoxFetched !== false;
  const lastNew = [...k.series.newPrice].reverse().find(([, v]) => Number.isFinite(v) && v > 0)?.[1] ?? null;
  const rt = rankTrend(k.series.rank, at), ot = offerTrend(k.series.offerCount, at), bt = bb ? bbTrend(k.series.buyBox, at) : null;
  const history: PlHistory = {
    rankTrend: rt.value, rankTrendWhy: rt.why,
    offerTrend: ot.value, offerTrendWhy: ot.why,
    bbTrend: bt?.value ?? null, bbTrendWhy: bt?.why ?? "Buy Box history not fetched for this listing",
    keepaRankDrops30: s.keepaRankDrops30 ?? null,
    buyBoxFetched: bb,
  };
  const drops90 = k.rankDrops90 ?? (k.series.rank.length ? rankDrops(k.series.rank, at - 90 * DAY, at) : null);
  return {
    title: k.title, brand: k.brand, image: k.imageUrl,
    price: lastNew, rating: k.ratingNow ?? null, review_count: k.reviewsNow ?? null,
    rank: s.rankNow, avg_rank_90d: s.avgRank90d, rank_drops_90d: drops90,
    bought_past_month: s.monthlySold, offer_count: s.offersNow,
    buybox_price: bb ? s.currentBuyBox : null,
    amazon_ever_seller: s.amazonLastSeenDays != null,
    amazon_brand: isAmazonBrand(k.brand),
    dimensions: k.dimsCm, weight: k.weightG, first_seen: k.firstSeen ?? null,
    history, snapshot_at: new Date(at).toISOString(),
  };
}

type Snapshot = ReturnType<typeof snapshotOf>;

/** The newest snapshot of each ASIN taken for any candidate in the last 7 days. */
async function recentSnapshots(asins: string[]): Promise<Map<string, Snapshot>> {
  const out = new Map<string, Snapshot>();
  if (!asins.length) return out;
  const since = new Date(Date.now() - REUSE_MS).toISOString();
  const rows = must(await db().from("pl_candidate_asins").select(ASIN_COLS).in("asin", asins).gte("snapshot_at", since).order("snapshot_at", { ascending: false }), "recent snapshots") as Record<string, unknown>[];
  for (const r of rows) {
    const a = r.asin as string;
    const cur = out.get(a);
    const h = r.history as PlHistory | null;
    // A snapshot with the Buy Box history beats a newer one without it.
    if (!cur || (!cur.history.buyBoxFetched && h?.buyBoxFetched)) {
      // The snapshot only: not which candidate or position it was taken for.
      const snap: Record<string, unknown> = { ...asinRow(r) };
      for (const k of ["candidate_id", "asin", "position", "is_reference"]) delete snap[k];
      out.set(a, snap as unknown as Snapshot);
    }
  }
  // The trends are worked out again from the stored series (free), so a change to how they're
  // read applies at once rather than when the snapshot ages out.
  const at = Date.now();
  const series = must(await db().from("keepa_snapshots").select("asin, fetched_at, rank_series, offer_count_series, buybox_series, summary").in("asin", [...out.keys()]).gte("fetched_at", since).order("fetched_at", { ascending: false }), "stored series") as
    { asin: string; rank_series: Point[] | null; offer_count_series: Point[] | null; buybox_series: Point[] | null; summary: { buyBoxFetched?: boolean } | null }[];
  const done = new Set<string>();
  for (const r of series) {
    const snap = out.get(r.asin);
    if (!snap || done.has(r.asin)) continue;
    const bb = r.summary?.buyBoxFetched !== false;
    // Only the series the reused snapshot had: a history-only row can't stand in for a Buy Box one.
    if (snap.history.buyBoxFetched && !bb) continue;
    done.add(r.asin);
    const rt = rankTrend(r.rank_series ?? [], at), ot = offerTrend(r.offer_count_series ?? [], at), bt = bb ? bbTrend(r.buybox_series ?? [], at) : null;
    snap.history = {
      ...snap.history,
      rankTrend: rt.value, rankTrendWhy: rt.why, offerTrend: ot.value, offerTrendWhy: ot.why,
      ...(bt ? { bbTrend: bt.value, bbTrendWhy: bt.why } : {}),
    };
  }
  return out;
}

export interface RefreshResult { tokensUsed: number; fetched: string[]; reused: string[]; missing: string[]; filled: string[]; skippedManual: string[]; exhausted: boolean; keepa: boolean }

/**
 * Keepa for the candidate's ASINs, then the Gate 0, 1 and 2 fill. Snapshots under 7 days old
 * (from any candidate) are reused. Two stages, as in the wholesale pipeline: the reference listing
 * with the Buy Box history (3 tokens), the rest history-only (1 token), both with the rating and
 * review count. Tokens go on the candidate's ledger, which the dashboard counts. Fields you typed
 * are left alone.
 */
export async function refreshCandidate(id: string, opts: { force?: boolean } = {}): Promise<RefreshResult> {
  const d = db();
  const pinned = ((await d.from("pl_candidates").select("reference_pinned").eq("id", id).maybeSingle()).data as { reference_pinned?: boolean } | null)?.reference_pinned ?? false;
  let rows = (must(await d.from("pl_candidate_asins").select("asin, is_reference, position, first_seen").eq("candidate_id", id).order("position"), "asins") as { asin: string; is_reference: boolean; position: number; first_seen: string | null }[]);
  // The longest Keepa history known so far is the reference (unless you picked one), so it's the
  // listing fetched with its Buy Box history.
  if (!pinned && rows.some((r) => r.first_seen)) {
    const want = defaultReference(rows);
    if (want && !rows.find((r) => r.asin === want)?.is_reference) {
      await markReference(id, want);
      rows = rows.map((r) => ({ ...r, is_reference: r.asin === want }));
    }
  }
  const keepa = getKeepa();
  const result: RefreshResult = { tokensUsed: 0, fetched: [], reused: [], missing: [], filled: [], skippedManual: [], exhausted: false, keepa: keepa.available };
  const recent = opts.force ? new Map<string, Snapshot>() : await recentSnapshots(rows.map((r) => r.asin));
  const snaps = new Map<string, Snapshot>();
  const needRef: string[] = [], needRest: string[] = [];
  for (const r of rows) {
    const s = recent.get(r.asin);
    if (s && (!r.is_reference || s.history.buyBoxFetched)) { snaps.set(r.asin, s); result.reused.push(r.asin); }
    else (r.is_reference ? needRef : needRest).push(r.asin);
  }

  let spent = 0;
  const onResponse: OnKeepaResponse = (m) => { spent += m.tokensConsumed; };
  const fetched = new Map<string, KeepaProduct>();
  if (keepa.available) {
    try {
      for (const [list, buyBox] of [[needRef, true], [needRest, false]] as const) {
        if (!list.length) continue;
        const res = await keepa.lookupByAsins(list, onResponse, { buyBox, rating: true });
        for (const [a, k] of res.byAsin) if (k.title || k.series.rank.length) fetched.set(a, k);
        if (res.exhausted) result.exhausted = true;
      }
    } finally {
      if (spent) {
        const cur = must(await d.from("pl_candidates").select("token_cost, keepa_by_day").eq("id", id).single(), "ledger") as { token_cost: number; keepa_by_day: TokensByDay };
        must(await d.from("pl_candidates").update({ token_cost: (cur.token_cost ?? 0) + spent, keepa_by_day: addDailyTokens(cur.keepa_by_day, spent, new Date(), PL_KEEP_DAYS) }).eq("id", id), "ledger");
      }
    }
  }
  result.tokensUsed = spent;
  for (const [a, k] of fetched) {
    snaps.set(a, snapshotOf(k));
    result.fetched.push(a);
    // The wholesale pipeline reuses these too.
    await saveSnapshot(k).catch((e) => console.error(`[pl] keepa snapshot for ${a} not stored: ${(e as Error).message}`));
  }
  for (const r of rows) if (!snaps.has(r.asin)) result.missing.push(r.asin);
  for (const [asin, s] of snaps) must(await d.from("pl_candidate_asins").update(s).eq("candidate_id", id).eq("asin", asin), "save snapshot");

  let asins = (must(await d.from("pl_candidate_asins").select(ASIN_COLS).eq("candidate_id", id).order("position"), "asins") as Record<string, unknown>[]).map(asinRow);
  // First seen only known now (a new candidate): the longest history becomes the reference, with
  // its Buy Box history fetched (3 tokens) unless a 7-day snapshot has it.
  const want = pinned ? null : defaultReference(asins.filter((a) => a.snapshot_at));
  if (want && !asins.find((a) => a.asin === want)?.is_reference) {
    const sw = await switchReference(id, want, { pinned: false, fetch: keepa.available });
    result.tokensUsed += sw.tokensUsed;
    asins = (must(await d.from("pl_candidate_asins").select(ASIN_COLS).eq("candidate_id", id).order("position"), "asins") as Record<string, unknown>[]).map(asinRow);
  }
  const fill = keepaFill(asins, await bandOf(id));
  result.filled = await applyAuto(id, fill, "keepa");
  result.skippedManual = Object.keys(fill).filter((k) => !result.filled.includes(k));
  must(await d.from("pl_candidates").update({ refreshed_at: now(), updated_at: now() }).eq("id", id), "refreshed");
  return result;
}

/* ===================== Gate 2's reference listing ===================== */

async function markReference(id: string, asin: string) {
  const d = db();
  must(await d.from("pl_candidate_asins").update({ is_reference: false }).eq("candidate_id", id).neq("asin", asin), "reference");
  must(await d.from("pl_candidate_asins").update({ is_reference: true }).eq("candidate_id", id).eq("asin", asin), "reference");
}

/**
 * Gate 2 again from the reference listing: its fields refilled (never over yours), and those the
 * new reference can't say (no Buy Box history yet) cleared rather than left from the old one.
 */
async function applyGate2(id: string): Promise<string[]> {
  const d = db();
  const asins = (must(await d.from("pl_candidate_asins").select(ASIN_COLS).eq("candidate_id", id).order("position"), "asins") as Record<string, unknown>[]).map(asinRow);
  const fill = keepaFill(asins, await bandOf(id));
  const g2: Fill = Object.fromEntries(GATE2_KEYS.filter((k) => fill[k]).map((k) => [k, fill[k]]));
  const filled = await applyAuto(id, g2, "keepa");
  const gone = GATE2_KEYS.filter((k) => !fill[k]);
  if (gone.length) must(await d.from("pl_candidate_fields").delete().eq("candidate_id", id).eq("source", "keepa").in("key", gone), "clear Gate 2");
  return filled;
}

/**
 * Make an ASIN Gate 2's reference and run Gate 2 again (Gate 2 only). Its Buy Box history comes
 * from a snapshot under 7 days old when there is one; else, with `fetch`, from Keepa (about 3
 * tokens, on the candidate's ledger); else Gate 2 goes without it until the next refresh.
 */
export async function switchReference(id: string, asin: string, o: { pinned: boolean; fetch: boolean }) {
  const d = db();
  const a = asin.trim().toUpperCase();
  const row = (await d.from("pl_candidate_asins").select(ASIN_COLS).eq("candidate_id", id).eq("asin", a).maybeSingle()).data as Record<string, unknown> | null;
  if (!row) throw new Error(`${a} isn't one of this candidate's page-one ASINs`);
  await markReference(id, a);
  if (o.pinned) must(await d.from("pl_candidates").update({ reference_pinned: true, updated_at: now() }).eq("id", id), "pin reference");
  const out = { asin: a, tokensUsed: 0, buyBox: "had" as "had" | "reused" | "fetched" | "missing" };
  const cur = asinRow(row);
  const fresh = cur.snapshot_at && Date.now() - Date.parse(cur.snapshot_at) < REUSE_MS;
  if (!(fresh && cur.history?.buyBoxFetched)) {
    const recent = (await recentSnapshots([a])).get(a);
    if (recent?.history.buyBoxFetched) {
      must(await d.from("pl_candidate_asins").update(recent).eq("candidate_id", id).eq("asin", a), "save snapshot");
      out.buyBox = "reused";
    } else if (o.fetch && getKeepa().available) {
      let spent = 0;
      try {
        const res = await getKeepa().lookupByAsins([a], (m) => { spent += m.tokensConsumed; }, { buyBox: true, rating: true });
        const k = res.byAsin.get(a);
        if (k) {
          must(await d.from("pl_candidate_asins").update(snapshotOf(k)).eq("candidate_id", id).eq("asin", a), "save snapshot");
          await saveSnapshot(k).catch((e) => console.error(`[pl] keepa snapshot for ${a} not stored: ${(e as Error).message}`));
          out.buyBox = "fetched";
        } else out.buyBox = "missing";
      } finally {
        if (spent) {
          const c = must(await d.from("pl_candidates").select("token_cost, keepa_by_day").eq("id", id).single(), "ledger") as { token_cost: number; keepa_by_day: TokensByDay };
          must(await d.from("pl_candidates").update({ token_cost: (c.token_cost ?? 0) + spent, keepa_by_day: addDailyTokens(c.keepa_by_day, spent, new Date(), PL_KEEP_DAYS) }).eq("id", id), "ledger");
        }
        out.tokensUsed = spent;
      }
    } else out.buyBox = "missing";
  }
  const filled = await applyGate2(id);
  return { ...out, filled };
}

/**
 * Existing candidates onto the default reference (the longest Keepa history) where you haven't
 * picked one, from what's stored: no Keepa tokens. A new reference without Buy Box history leaves
 * that check empty until the next refresh. Returns what moved.
 */
export async function rescoreReferences(): Promise<{ id: string; name: string; from: string | null; to: string; buyBox: string }[]> {
  const d = db();
  const cands = must(await d.from("pl_candidates").select("id, name, reference_pinned"), "candidates") as { id: string; name: string; reference_pinned: boolean | null }[];
  const out = [];
  for (const c of cands) {
    if (c.reference_pinned) continue;
    const rows = must(await d.from("pl_candidate_asins").select("asin, position, first_seen, is_reference, snapshot_at").eq("candidate_id", c.id), "asins") as { asin: string; position: number; first_seen: string | null; is_reference: boolean; snapshot_at: string | null }[];
    const want = defaultReference(rows.filter((r) => r.snapshot_at));
    const from = rows.find((r) => r.is_reference)?.asin ?? null;
    if (!want || want === from) continue;
    const r = await switchReference(c.id, want, { pinned: false, fetch: false });
    out.push({ id: c.id, name: c.name, from, to: want, buyBox: r.buyBox });
  }
  return out;
}

/* ===================== Opportunity Explorer ===================== */

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Attach a capture to a candidate and fill Gates 3 and 5 from it (never over your own values).
 * Says which of the eight fields the capture didn't have, so a capture that read nothing can't
 * look like a success.
 */
export async function attachPoe(snapshotId: string, candidateId: string): Promise<{ filled: string[]; unread: string[] }> {
  const d = db();
  must(await d.from("pl_poe_snapshots").update({ candidate_id: candidateId }).eq("id", snapshotId), "attach capture");
  const snap = must(await d.from("pl_poe_snapshots").select(POE_COLS).eq("id", snapshotId).single(), "capture") as PoeSnapshot;
  const filled = await applyAuto(candidateId, poeFill(snap as unknown as PoeExtract), "poe");
  must(await d.from("pl_candidates").update({ updated_at: now() }).eq("id", candidateId), "touch candidate");
  return { filled, unread: unreadFields(snap as unknown as PoeExtract) };
}

const extractColumns = (x: PoeExtract) => ({
  niche_id: x.niche_id, niche_title: x.niche_title,
  search_volume_360: x.search_volume_360, search_volume_growth: x.search_volume_growth, search_volume_growth_source: x.search_volume_growth_source,
  search_volume_growth_90: x.search_volume_growth_90, search_volume_growth_360: x.search_volume_growth_360, products_in_niche: x.products_in_niche,
  top3_click_share: x.top3_click_share, search_conversion: x.search_conversion, search_conversion_source: x.search_conversion_source,
  avg_units_per_product: x.avg_units_per_product, search_terms: x.search_terms,
});

/**
 * Read every stored capture again with the current parser (the raw payload is kept for this),
 * and fill Gates 3 and 5 again for the candidates they're attached to.
 */
export async function reparsePoe(): Promise<{ id: string; candidate_id: string | null; captured_at: string; extracted: PoeExtract; unread: string[]; filled: string[] }[]> {
  const d = db();
  const rows = must(await d.from("pl_poe_snapshots").select("id, candidate_id, niche_id, captured_at, raw").order("captured_at", { ascending: false }), "captures") as
    { id: string; candidate_id: string | null; niche_id: string | null; captured_at: string; raw: unknown }[];
  const out = [];
  for (const r of rows) {
    const x = extractPoe(r.raw, { nicheId: r.niche_id });
    must(await d.from("pl_poe_snapshots").update(extractColumns(x)).eq("id", r.id), "re-read capture");
    const filled = r.candidate_id ? await applyAuto(r.candidate_id, poeFill(x), "poe") : [];
    out.push({ id: r.id, candidate_id: r.candidate_id, captured_at: r.captured_at, extracted: x, unread: unreadFields(x), filled });
  }
  return out;
}

/**
 * A niche the extension captured on Opportunity Explorer: stored with what was read from it, and
 * attached to the candidate whose niche keyword is the niche's title (any case). Otherwise the
 * extension shows the candidates to pick from.
 */
export async function savePoe(input: { nicheId?: string | null; title?: string | null; raw: unknown }) {
  if (input.raw == null || typeof input.raw !== "object") throw new Error("Nothing captured to send");
  const size = JSON.stringify(input.raw).length;
  if (size > 3_000_000) throw new Error("The capture is too large to store");
  const x = extractPoe(input.raw, { nicheId: input.nicheId ?? null, title: input.title ?? null });
  const d = db();
  const snap = must(await d.from("pl_poe_snapshots").insert({ raw: input.raw, ...extractColumns(x) }).select("id").single(), "save capture") as { id: string };
  const unread = unreadFields(x);
  const candidates = must(await d.from("pl_candidates").select("id, name, niche_keyword, status").order("updated_at", { ascending: false }), "candidates") as
    { id: string; name: string; niche_keyword: string | null; status: string }[];
  const match = x.niche_title ? candidates.find((c) => norm(c.niche_keyword) && norm(c.niche_keyword) === norm(x.niche_title)) : undefined;
  // A capture with nothing readable isn't attached by title (there's no title): it's saved for re-reading.
  const filled = match ? (await attachPoe(snap.id, match.id)).filled : [];
  return {
    snapshotId: snap.id,
    extracted: x,
    unread,
    attached: match ? { id: match.id, name: match.name, filled } : null,
    candidates: match ? [] : candidates.filter((c) => c.status !== "dropped").map((c) => ({ id: c.id, name: c.name, niche_keyword: c.niche_keyword })),
  };
}

/** Tokens spent on private-label refreshes per UK day (for the dashboard's Keepa tile). */
export async function plTokensByDay(): Promise<TokensByDay[]> {
  const res = await db().from("pl_candidates").select("keepa_by_day");
  if (res.error) return []; // before the migration
  return (res.data as { keepa_by_day: TokensByDay | null }[]).map((r) => r.keepa_by_day ?? {});
}

/**
 * Home's Private label tiles: candidates by verdict, the last Niche Hunt, and the Keepa tokens
 * private label has spent this month (candidates' refreshes and hunts, UK days).
 */
export async function plDashboard() {
  const { candidates, settings, card, adsCpc } = await listCandidates();
  const verdicts: Record<string, number> = { pass: 0, warn: 0, fail: 0, empty: 0 };
  for (const c of candidates) {
    const fields = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.value]));
    verdicts[evaluate(withAdsDefaults(fields, adsCpc), c.category, settings, card, new Date(), c.waivers).v.cls]++;
  }
  const hunts = await db().from("pl_hunts").select("id, name, status, created_at, token_cost, keepa_by_day").order("created_at", { ascending: false });
  const huntRows = (hunts.error ? [] : hunts.data) as { id: string; name: string; status: string; created_at: string; token_cost: number; keepa_by_day: TokensByDay | null }[];
  const month = ukDay().slice(0, 7);
  const inMonth = (l: TokensByDay | null | undefined) => Object.entries(l ?? {}).reduce((a, [day, t]) => a + (day.startsWith(month) ? t : 0), 0);
  const candidateLedgers = must(await db().from("pl_candidates").select("keepa_by_day"), "ledgers") as { keepa_by_day: TokensByDay | null }[];
  // Counted in SQL and read a page at a time: there can be thousands of niches.
  const [nicheCounts, nicheTokens, suppliers] = await Promise.all([nicheSummary().catch(() => null), nicheLedgers().catch(() => [] as TokensByDay[]), supplierSummary().catch(() => null)]);
  const last = huntRows[0] ?? null;
  return {
    candidates: candidates.length,
    verdicts,
    lastHunt: last ? { id: last.id, name: last.name, status: last.status, created_at: last.created_at, token_cost: last.token_cost } : null,
    tokensThisMonth: candidateLedgers.reduce((a, r) => a + inMonth(r.keepa_by_day), 0) + huntRows.reduce((a, h) => a + inMonth(h.keepa_by_day), 0) + nicheTokens.reduce((a, l) => a + inMonth(l), 0),
    /** Niche Import: imported, shortlisted, incumbent-checked. */
    niches: nicheCounts ? { total: nicheCounts.total, shortlisted: nicheCounts.shortlisted, checked: nicheCounts.checked } : { total: 0, shortlisted: 0, checked: 0 },
    suppliers: suppliers ? { captured: suppliers.captured, toContact: suppliers.toContact, contacted: suppliers.contacted, quoted: suppliers.quoted } : null,
    month,
  };
}
