import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { DEFAULT_SETTINGS, econ, evaluate, GATES, gateChecks, scorecard, SETTINGS_DEF, verdict, gateStatus, type Fields, type Settings } from "./gatekeeper";

/**
 * Gatekeeper's own functions, run from docs/gatekeeper-reference.html: everything from the schema
 * to the persistence section is pure (it reads only its tables and arguments).
 */
type Ref = {
  GATES: { id: string; fields: { k: string; type: string; opts?: [string, string][] }[] }[];
  SETTINGS_DEF: { k: string; d: number }[];
  RATES: { storageCuFt: { std: number; q4: number }; lowPriceThreshold: number; lowPriceThresholdBHPC: number;
    tiers: { id: string; name: string; max: number[]; maxG: number; useDim: boolean; bands: number[][]; low?: number[][]; peakAdd?: number }[];
    oversize: { id: string; name: string; max: number[]; maxUnitG: number; maxDimG: number; base: number; baseG: number; perKg: number }[] };
  REFERRAL: [string, [number, number][]][];
  BHPC_LOW: Set<string>;
  gateChecks: (g: { id: string }, f: Fields, S: Settings, cat: string) => unknown[];
  gateStatus: (rows: unknown[]) => string;
  scorecard: (f: Fields, S: Settings, cat: string) => { rows: { pts: number | null }[]; total: number; answered: number };
  verdict: (sc: unknown, gates: { status: string }[]) => unknown;
  econ: (f: Fields, S: Settings, cat: string) => Record<string, unknown> | null;
};

function reference(): Ref {
  const html = readFileSync(join(process.cwd(), "docs/gatekeeper-reference.html"), "utf8");
  const start = html.indexOf("const YN");
  const end = html.indexOf("/* ===================== persistence");
  const src = html.slice(start, end);
  return new Function(`${src}; return { GATES, SETTINGS_DEF, RATES, REFERRAL, BHPC_LOW, gateChecks, gateStatus, scorecard, verdict, econ };`)() as Ref;
}

const ref = reference();
const card = UK_RATE_CARD_2026_07;

/** A seeded generator: the same inputs every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCandidate(r: () => number): { f: Fields; S: Settings; cat: string } {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const maybe = (v: () => string) => (r() < 0.15 ? "" : v());
  const n = (lo: number, hi: number, dp = 0) => (lo + r() * (hi - lo)).toFixed(dp);
  const f: Fields = {};
  for (const g of ref.GATES) {
    for (const fd of g.fields) {
      if (r() < 0.1) continue; // never filled
      if (fd.type === "yn") f[fd.k] = maybe(() => pick(["yes", "no"]));
      else if (fd.type === "sel") f[fd.k] = pick(fd.opts!.map((o) => o[0]));
      else f[fd.k] = maybe(() => {
        switch (fd.k) {
          case "sell": return n(4, 260, 2);
          case "landed": return n(0.5, 30, 2);
          case "weight": return n(10, 24000);
          case "dimL": case "dimW": case "dimH": return n(0.5, r() < 0.8 ? 40 : 120, 1);
          case "avgRating": return n(3, 5, 1);
          case "top3Share": case "clickShare": case "complaintPct": case "fixCostPct": case "conv": return n(0, 80);
          case "sv360": return n(-100, 80000);
          case "fbaOverride": return r() < 0.7 ? "" : n(1, 8, 2);
          case "units": return n(50, 800);
          default: return n(0, 2000, r() < 0.5 ? 0 : 2);
        }
      });
    }
  }
  const S = { ...DEFAULT_SETTINGS, q4: r() < 0.3 ? 1 : 0, storageMonths: Number(n(0, 4)), budget: Number(n(500, 3000)) };
  return { f, S, cat: pick(ref.REFERRAL.map((x) => x[0])) };
}

describe("Gatekeeper port", () => {
  it("has the same gates, fields and settings", () => {
    expect(GATES.map((g) => [g.id, g.fields.map((f) => [f.k, f.type, f.opts ?? null])]))
      .toEqual(ref.GATES.map((g) => [g.id, g.fields.map((f) => [f.k, f.type, f.opts ?? null])]));
    expect(SETTINGS_DEF.map((s) => [s.k, s.d])).toEqual(ref.SETTINGS_DEF.map((s) => [s.k, s.d]));
  });

  it("reads the same rate tables as the app's July 2026 card", () => {
    const R = ref.RATES;
    expect(card.storage.standardPerCuFt).toBe(R.storageCuFt.std);
    expect(card.storage.peakPerCuFt).toBe(R.storageCuFt.q4);
    expect(card.lowPrice.threshold).toBe(R.lowPriceThreshold);
    expect(card.lowPrice.reducedThreshold).toBe(R.lowPriceThresholdBHPC);
    expect(new Set(card.lowPrice.reducedCategories)).toEqual(ref.BHPC_LOW);
    expect(card.tiers.map((t) => [t.id, t.name, t.maxDimsCm, t.maxWeightG, t.useDimWeight, t.bands, t.lowPriceBands ?? null, t.peakSurcharge ?? 0]))
      .toEqual(R.tiers.map((t) => [t.id, t.name, t.max, t.maxG, t.useDim, t.bands, t.low ?? null, t.peakAdd ?? 0]));
    expect(card.oversize.map((o) => [o.id, o.name, o.maxDimsCm, o.maxUnitWeightG, o.maxDimWeightG, o.baseFee, o.baseWeightG, o.perKg]))
      .toEqual(R.oversize.map((o) => [o.id, o.name, o.max, o.maxUnitG, o.maxDimG, o.base, o.baseG, o.perKg]));
    expect(card.referral.categories.map((c) => [c.name, c.bands.map((b) => [b.upTo ?? Infinity, b.pct])]))
      .toEqual(ref.REFERRAL.map(([name, bands]) => [name, bands]));
  });

  it("gives Gatekeeper's checks, gate statuses, scorecard, verdict and economics on 3,000 random candidates", () => {
    const r = rng(20260701);
    for (let i = 0; i < 3000; i++) {
      const { f, S, cat } = randomCandidate(r);
      const ours = evaluate(f, cat, S, card);
      const theirsGates = ref.GATES.map((g) => {
        const rows = ref.gateChecks(g, f, S, cat);
        return { rows, status: ref.gateStatus(rows) };
      });
      // Gatekeeper leaves two details as numbers (it renders them as text); the port keeps text.
      const asText = (rows: unknown[]) => (rows as { detail: unknown }[]).map((x) => ({ ...x, detail: String(x.detail) }));
      expect(ours.gates.map((g) => g.rows)).toEqual(theirsGates.map((g) => asText(g.rows)));
      expect(ours.gates.map((g) => g.status)).toEqual(theirsGates.map((g) => g.status));
      const sc = ref.scorecard(f, S, cat);
      expect(ours.sc).toEqual(sc);
      expect(ours.v).toEqual(ref.verdict(sc, theirsGates));

      const e = econ(f, S, cat, card), t = ref.econ(f, S, cat);
      if (!t) { expect(e).toBeNull(); continue; }
      for (const k of ["sell", "landed", "pct", "referralBase", "referral", "lowPrice", "lowThreshold", "fbaBase", "fbaSource", "fbaV", "inbound", "prep", "returns", "pL", "pS", "amazonTake", "mL", "mS", "multiple"] as const) {
        const a = e![k as keyof typeof e], b = t[k];
        if (typeof b === "number") expect(a as number, `${k} #${i}`).toBeCloseTo(b, 9);
        else expect(a, `${k} #${i}`).toEqual(b);
      }
      // Storage: same formula, same rates.
      if (t.storage == null) expect(e!.storage).toBeNull();
      else expect(e!.storage!).toBeCloseTo(t.storage as number, 9);
      const tt = t.tier as { name: string; fee: number | null; shipG: number } | null;
      expect(e!.tier?.name ?? null).toBe(tt?.name ?? null);
      if (tt?.fee == null) expect(e!.tier?.fee ?? null).toBeNull();
      else expect(e!.tier!.fee!).toBeCloseTo(tt.fee, 9);
    }
  });

  it("never lets a good score override a failed gate", () => {
    const sc = scorecard({}, DEFAULT_SETTINGS, "Home Products", card);
    const full = { ...sc, answered: 10, total: 27 };
    expect(verdict(full, [{ status: "pass" }, { status: "fail" }]).title).toBe("Strong score, but a gate failed");
    expect(verdict(full, [{ status: "pass" }, { status: "warn" }]).title).toBe("Order samples");
    expect(gateStatus(gateChecks("g6", {}, DEFAULT_SETTINGS, "Home Products", card))).toBe("empty");
  });
});
