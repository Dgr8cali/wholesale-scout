/** Gate 2's reference listing: the longest Keepa history by default, your pick kept, Gate 2 only re-run. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeepaProduct, KeepaSummary } from "../keepa/types";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { createCandidate, getCandidate, refreshCandidate, refreshPriceTight, rescoreReferences, setField, switchReference } from "./pl";

const k = vi.hoisted(() => ({ calls: [] as { asins: string[]; buyBox: boolean }[] }));
const DAY = 86_400_000;
const FIRST: Record<string, string> = { B0NEW00001: "2026-03-03", B0OLD00001: "2022-07-07", B0MID00001: "2023-06-21" };
const BOUGHT: Record<string, number | null> = { B0NEW00001: 500, B0OLD00001: 300, B0MID00001: null };

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const product = (asin: string, buyBox: boolean): KeepaProduct => {
    const now = Date.now();
    const rank = Array.from({ length: 60 }, (_, i) => [now - (400 - i * 7) * DAY, 5000 + i * 10] as [number, number]);
    return {
      asin, eans: [], title: `Fountain ${asin}`, brand: "B", category: null, dimsCm: null, weightG: null, parentAsin: null, variationCount: null, imageUrl: null,
      firstSeen: new Date(FIRST[asin]).toISOString(), reviewsNow: 100, ratingNow: 4.4, rankDrops90: 240,
      summary: { rankNow: 5000, avgRank90d: 5200, monthlySold: BOUGHT[asin], offersNow: 4, currentBuyBox: 20, amazonLastSeenDays: null, buyBoxFetched: buyBox } as unknown as KeepaSummary,
      buyBoxSellers: [], series: { rank, buyBox: buyBox ? rank.map(([t]) => [t, 20] as [number, number]) : [], newPrice: [[now - DAY, 19.99]], offerCount: rank.map(([t]) => [t, 4] as [number, number]), amazon: [], reviewCount: [] },
    } as unknown as KeepaProduct;
  };
  const fake = {
    available: true,
    async lookupByAsins(asins: string[], onResponse?: (m: { tokensConsumed: number }) => void, o: { buyBox?: boolean } = {}) {
      const buyBox = o.buyBox !== false;
      k.calls.push({ asins, buyBox });
      onResponse?.({ tokensConsumed: asins.length * (buyBox ? 3 : 1) });
      return { byEan: new Map(), byAsin: new Map(asins.map((a) => [a, product(a, buyBox)])), tokensUsed: asins.length * (buyBox ? 3 : 1), tokensLeft: 500, requests: [] };
    },
    async tokenStatus() { return { tokensLeft: 500, refillInMs: 60_000, refillRate: 20 }; },
  };
  return { ...real, getKeepa: () => fake };
});

describe("Gate 2's reference listing", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    k.calls.length = 0;
  });
  const field = (id: string, key: string) => fake.tables.pl_candidate_fields?.find((f) => f.candidate_id === id && f.key === key);
  const ref = (id: string) => fake.tables.pl_candidate_asins.find((a) => a.candidate_id === id && a.is_reference)?.asin;

  it("a new candidate's first refresh moves the reference to the longest history, with its Buy Box history", async () => {
    const c = await createCandidate({ name: "Cat fountain", asins: ["B0NEW00001", "B0OLD00001", "B0MID00001"] });
    const r = await refreshCandidate(c.id);
    expect(ref(c.id)).toBe("B0OLD00001");
    // First pass: the first ASIN with its Buy Box (3), the rest history-only (1 each); then the old one's Buy Box (3).
    expect(k.calls).toEqual([{ asins: ["B0NEW00001"], buyBox: true }, { asins: ["B0OLD00001", "B0MID00001"], buyBox: false }, { asins: ["B0OLD00001"], buyBox: true }]);
    expect(r.tokensUsed).toBe(3 + 2 + 3);
    expect(field(c.id, "bought")).toMatchObject({ value: "300", source: "keepa" });
    const d = await getCandidate(c.id);
    expect(d!.refRank).toMatchObject({ asin: "B0OLD00001" });
    expect(d!.refRank!.points.length).toBeGreaterThan(40);
    expect(d!.refRank!.points.every(([t]) => t >= Date.now() - 366 * DAY)).toBe(true);
    // Refreshing again: the reference is already right, nothing more to switch.
    k.calls.length = 0;
    await refreshCandidate(c.id);
    expect(k.calls).toEqual([]);
  });

  it("your pick re-runs Gate 2 only (a 7-day snapshot reused, else ~3 tokens), clears what it can't say, and sticks", async () => {
    const c = await createCandidate({ name: "Cat fountain", asins: ["B0NEW00001", "B0OLD00001", "B0MID00001"] });
    await refreshCandidate(c.id);
    Object.assign(field(c.id, "sell")!, { value: "24", source: "manual" });
    k.calls.length = 0;
    // B0MID00001 has no bought-in-past-month: Gate 2's bought goes, and Keepa fetches its Buy Box.
    const s = await switchReference(c.id, "B0MID00001", { pinned: true, fetch: true });
    expect(s).toMatchObject({ asin: "B0MID00001", buyBox: "fetched", tokensUsed: 3 });
    expect(field(c.id, "bought")).toBeUndefined();
    expect(field(c.id, "rankDrops")).toMatchObject({ value: "80" });
    expect(field(c.id, "sell")).toMatchObject({ value: "24", source: "manual" });
    expect(fake.tables.pl_candidates[0]).toMatchObject({ reference_pinned: true });
    // Back to the old one: its Buy Box snapshot is under 7 days old, so no Keepa.
    k.calls.length = 0;
    expect(await switchReference(c.id, "B0OLD00001", { pinned: true, fetch: true })).toMatchObject({ tokensUsed: 0, buyBox: "had" });
    expect(k.calls).toEqual([]);
    await switchReference(c.id, "B0MID00001", { pinned: true, fetch: true });
    // A pinned pick survives a refresh.
    await refreshCandidate(c.id);
    expect(ref(c.id)).toBe("B0MID00001");
    await expect(switchReference(c.id, "B0NOTHERE1", { pinned: true, fetch: true })).rejects.toThrow("isn't one of");
  });

  it("existing candidates move to the longest history with no Keepa; a pinned one stays", async () => {
    const a = await createCandidate({ name: "A", asins: ["B0NEW00001", "B0OLD00001"] });
    const b = await createCandidate({ name: "B", asins: ["B0NEW00001", "B0OLD00001"] });
    for (const id of [a.id, b.id]) {
      await refreshCandidate(id);
      // As before this change: the first ASIN the reference.
      fake.tables.pl_candidate_asins.filter((x) => x.candidate_id === id).forEach((x) => { x.is_reference = x.asin === "B0NEW00001"; });
    }
    fake.tables.pl_candidates.find((c) => c.id === b.id)!.reference_pinned = true;
    k.calls.length = 0;
    const moved = await rescoreReferences();
    expect(moved).toEqual([{ id: a.id, name: "A", from: "B0NEW00001", to: "B0OLD00001", buyBox: "had" }]);
    expect(k.calls).toEqual([]);
    expect(ref(b.id)).toBe("B0NEW00001");
  });

  it("a target price band of the candidate's own re-reads Gate 1's price spread (no Keepa)", async () => {
    const c = await createCandidate({ name: "Wipes", asins: ["B0NEW00001", "B0OLD00001", "B0MID00001"] });
    await refreshCandidate(c.id);
    expect(field(c.id, "priceTight")).toMatchObject({ value: "yes" }); // ~£20 in £14.40–£42
    k.calls.length = 0;
    await setField(c.id, "bandMin", "8");
    await setField(c.id, "bandMax", "15");
    expect(await refreshPriceTight(c.id)).toEqual(["priceTight"]);
    expect(field(c.id, "priceTight")).toMatchObject({ value: "no", source: "keepa" }); // £20 outside £6.40–£18
    expect(k.calls).toEqual([]);
    // Your own answer stays.
    await setField(c.id, "priceTight", "yes");
    expect(await refreshPriceTight(c.id)).toEqual([]);
    expect(field(c.id, "priceTight")).toMatchObject({ value: "yes", source: "manual" });
  });
});
