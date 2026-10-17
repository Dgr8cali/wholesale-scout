import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { budget, capitalFor, capitalText, DEFAULT_SETTINGS, gateBlurb, econ, evaluate, GATES, gateChecks, priceBand, scorecard, SETTINGS_DEF, verdict, gateStatus, type Fields, type Settings } from "./gatekeeper";

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

/**
 * The port's two intentional differences from Gatekeeper, applied to the reference so everything
 * else can still be compared exactly:
 *  1. Storage carries VAT and the digital services fee, like every other Amazon fee (the fee
 *     engine's rule); Gatekeeper added it ex-VAT.
 *  2. Peak rates follow the card's peak months (Oct–Dec) by date, as the fee engine does, instead
 *     of Gatekeeper's manual Q4 setting: the reference is given q4 = 1 exactly when the date is in
 *     them (see refSettings).
 */
const STORAGE_EX_VAT = "return cuft*rate*(S.storageMonths||0);";
const STORAGE_WITH_VAT = "return cuft*rate*(S.storageMonths||0)*(1+S.vat/100)*(1+(S.dst||0)/100);";

function reference(aligned: boolean): Ref {
  const html = readFileSync(join(process.cwd(), "docs/gatekeeper-reference.html"), "utf8");
  const start = html.indexOf("const YN");
  const end = html.indexOf("/* ===================== persistence");
  let src = html.slice(start, end);
  if (aligned) {
    if (!src.includes(STORAGE_EX_VAT)) throw new Error("Gatekeeper's storage line changed: update the alignment");
    src = src.replace(STORAGE_EX_VAT, STORAGE_WITH_VAT);
  }
  return new Function(`${src}; return { GATES, SETTINGS_DEF, RATES, REFERRAL, BHPC_LOW, gateChecks, gateStatus, scorecard, verdict, econ };`)() as Ref;
}

/** Gatekeeper as it is, and with the two alignments. */
const original = reference(false);
const ref = reference(true);
const peakOn = (date: Date) => [10, 11, 12].includes(date.getUTCMonth() + 1);
/** Gatekeeper's settings for a date: its Q4 switch on exactly in the peak months. */
const refSettings = (S: Settings, date: Date) => ({ ...S, q4: peakOn(date) ? 1 : 0 });
const card = UK_RATE_CARD_2026_07;

/** A seeded generator: the same inputs every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCandidate(r: () => number): { f: Fields; S: Settings; cat: string; date: Date } {
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
  const S = { ...DEFAULT_SETTINGS, storageMonths: Number(n(0, 4)), budget: Number(n(500, 3000)) };
  // Any month of the year, so both standard and peak rates are exercised.
  const date = new Date(Date.UTC(2026, Math.floor(r() * 12), 15));
  return { f, S, cat: pick(ref.REFERRAL.map((x) => x[0])), date };
}

describe("Gate 6 on the business's VAT basis", () => {
  const f = { sell: "24", landed: "4.00", dimL: "20", dimW: "15", dimH: "8", weight: "400", adsLaunch: "2", adsSteady: "0.8" };
  const aug = new Date(Date.UTC(2026, 7, 5));
  it("registered: revenue is the price ÷ 1.2, fees ex-VAT with the DSF, VAT payable as information", () => {
    const non = econ(f, DEFAULT_SETTINGS, "Home Products", card, aug)!;
    const reg = econ(f, { ...DEFAULT_SETTINGS, vatRegistered: 1 }, "Home Products", card, aug)!;
    expect(non).toMatchObject({ vatRegistered: false, revenue: 24, outputVat: 0, inputVat: 0 });
    expect(reg.vatRegistered).toBe(true);
    expect(reg.revenue).toBeCloseTo(20, 6);
    expect(reg.outputVat).toBeCloseTo(4, 6);
    // Fees lose their VAT (keep the 2% DSF): × 1.02 instead of × 1.2 × 1.02.
    expect(reg.referral).toBeCloseTo(non.referral / 1.2, 6);
    expect(reg.fbaV!).toBeCloseTo(non.fbaV! / 1.2, 6);
    // Steady profit: revenue − fees − landed − overheads − ads.
    expect(reg.pS!).toBeCloseTo(20 - reg.referral - reg.fbaV! - 4 - reg.over - 0.8, 6);
    expect(reg.mS!).toBeCloseTo((reg.pS! / 20) * 100, 6);
    expect(reg.vatPayable).toBeCloseTo(reg.outputVat - reg.inputVat, 6);
    expect(reg.inputVat).toBeCloseTo((reg.referral + reg.fbaV! + (reg.storage ?? 0)) * 0.2 + 4 * 0.2, 6);
  });
});

describe("Low-Price FBA on Gate 6", () => {
  // The lens wipes candidate: Beauty (low-price at £10 or less), 17 × 12 × 9 cm, 450 g: a small parcel.
  const wipes = { dimL: "17", dimW: "12", dimH: "9", weight: "450", landed: "1.80" };
  const cat = "Beauty, Health and Personal Care";
  const oct = new Date(Date.UTC(2026, 9, 5)), aug = new Date(Date.UTC(2026, 7, 5));
  it("£9.99 qualifies on price, but 450 g is over the small-parcel low-price limit (400 g): the standard rate, said why", () => {
    const e = econ({ ...wipes, sell: "9.99" }, DEFAULT_SETTINGS, cat, card, oct)!;
    expect(e).toMatchObject({ lowPrice: true, lowThreshold: 10, fbaSource: "peak", fbaBase: 3.04 + 0.11 });
    expect(e.fbaV!).toBeCloseTo(3.86, 2);
    expect(e.lowMiss).toBe("ships at 450 g: the Small parcel low-price rate stops at 400 g");
    // At £10.99 the price doesn't qualify either: the same fee, no low-price note.
    const dear = econ({ ...wipes, sell: "10.99" }, DEFAULT_SETTINGS, cat, card, oct)!;
    expect(dear).toMatchObject({ lowPrice: false, lowMiss: null, fbaBase: 3.15 });
  });
  it("at 400 g or under it takes the low-price rate (no peak surcharge)", () => {
    const e = econ({ ...wipes, weight: "390", sell: "9.99" }, DEFAULT_SETTINGS, cat, card, oct)!;
    expect(e).toMatchObject({ fbaSource: "low-price", fbaBase: 2.7, lowMiss: null });
    // 140 g in this box ships at its dimensional weight (~367 g): the 400 g band. In a smaller parcel, the 150 g one.
    expect(econ({ ...wipes, weight: "140", sell: "9.99" }, DEFAULT_SETTINGS, cat, card, aug)!).toMatchObject({ fbaSource: "low-price", fbaBase: 2.7 });
    expect(econ({ ...wipes, dimL: "13", dimW: "8", dimH: "7", weight: "140", sell: "9.99" }, DEFAULT_SETTINGS, cat, card, aug)!).toMatchObject({ fbaSource: "low-price", fbaBase: 2.67 });
    // 3 cm deep is a large envelope, with its own low-price rate.
    expect(econ({ ...wipes, dimH: "3", weight: "140", sell: "9.99" }, DEFAULT_SETTINGS, cat, card, aug)!).toMatchObject({ fbaSource: "low-price", fbaBase: 2.42 });
    // Home Products: low-price up to £20.
    expect(econ({ ...wipes, weight: "390", sell: "14.99" }, DEFAULT_SETTINGS, "Home Products", card, aug)!).toMatchObject({ fbaSource: "low-price", lowThreshold: 20 });
  });
});

describe("the target price band (the port's own field)", () => {
  const g0 = (f: Fields) => gateChecks("g0", f, DEFAULT_SETTINGS, "Home Products", card)[0];
  it("Gate 0's sell price check reads it; blank or upside-down is £18–35", () => {
    expect(priceBand({})).toEqual({ min: 18, max: 35, own: false });
    expect(priceBand({ bandMin: "8", bandMax: "15" })).toEqual({ min: 8, max: 15, own: true });
    expect(priceBand({ bandMin: "20", bandMax: "10" })).toMatchObject({ min: 18, max: 35, own: false });
    expect(g0({ sell: "12" })).toMatchObject({ label: "Sell price £18–35", status: "fail" });
    expect(g0({ sell: "12", bandMin: "8", bandMax: "15" })).toMatchObject({ label: "Sell price £8–15", status: "pass" });
    // Gatekeeper's warn margin, scaled: £15–40 around £18–35 is £6.67–17.14 around £8–15.
    expect(g0({ sell: "16.5", bandMin: "8", bandMax: "15" }).status).toBe("warn");
    expect(g0({ sell: "18", bandMin: "8", bandMax: "15" }).status).toBe("fail");
    expect(g0({ sell: "8.5", bandMin: "8.5", bandMax: "15" }).label).toBe("Sell price £8.50–15");
  });
});

describe("demand from bought in past month (the port's own rule)", () => {
  const line2 = (f: Fields) => scorecard(f, DEFAULT_SETTINGS, "Home Products", card).rows.find((r) => r.n === 2)!;
  const g2 = (f: Fields) => gateChecks("g2", f, DEFAULT_SETTINGS, "Home Products", card).map((c) => [c.label, c.status]);

  it("scorecard line 2: 0 under 50, 1 for 50–199, 2 for 200–499, 3 for 500+; rank drops only without it", () => {
    expect([49, 50, 199, 200, 499, 500].map((b) => line2({ bought: String(b), rankDrops: "250" }).pts)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(line2({ bought: "300" }).label).toBe("Demand (bought in past month)");
    expect(line2({ rankDrops: "250" })).toMatchObject({ label: "Demand (Keepa rank drops)", pts: 3 });
    expect(line2({ bought: "", rankDrops: "50" })).toMatchObject({ label: "Demand (Keepa rank drops)", pts: 1 });
  });

  it("Gate 2: the rank-drop check becomes a bought-in-past-month one when Amazon shows it", () => {
    expect(g2({ bought: "120", rankDrops: "10" })).toContainEqual(["100+ bought in past month (demand)", "pass"]);
    expect(g2({ bought: "60" })).toContainEqual(["100+ bought in past month (demand)", "warn"]);
    expect(g2({ bought: "60" }).some(([l]) => l === "100+ rank drops / month")).toBe(false);
    expect(g2({ rankDrops: "30" })).toContainEqual(["100+ rank drops / month", "fail"]);
  });
});

describe("Gatekeeper port", () => {
  it("has the same gates, fields and settings", () => {
    // The app's own additions (not in the reference): Gate 4's six words as text, for the RFQ.
    const APP_ONLY = new Set(["sixWordsText", "bestTermConv", "bandMin", "bandMax", "targetExworks", "maxMoq", "productUnit", "spec", "capital"]);
    // Gate 1's review bands read the newest third of page one: same bands, labels say so.
    const opts = (o: string[][] | undefined) => o?.map(([v, l]) => [v, l.replace(/^Newest third: m/, "M").replace(/^Newest third: s/, "S")]) ?? null;
    expect(GATES.map((g) => [g.id, g.fields.filter((f) => !APP_ONLY.has(f.k)).map((f) => [f.k, f.type, opts(f.opts as string[][] | undefined)])]))
      .toEqual(ref.GATES.map((g) => [g.id, g.fields.map((f) => [f.k, f.type, f.opts ?? null])]));
    // Every setting but the Q4 switch (peak rates now follow the date) and the budget (Settings → Business → Launch capital, same default).
    expect(SETTINGS_DEF.map((s) => [s.k, s.d])).toEqual(ref.SETTINGS_DEF.filter((s) => s.k !== "q4" && s.k !== "budget").map((s) => [s.k, s.d]));
    expect(DEFAULT_SETTINGS.budget).toBe(ref.SETTINGS_DEF.find((s) => s.k === "budget")!.d);
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

  it("gives Gatekeeper's checks, gate statuses, scorecard, verdict and economics (with the two alignments) on 3,000 random candidates", () => {
    const r = rng(20260701);
    for (let i = 0; i < 3000; i++) {
      const { f, S: ours_S, cat, date } = randomCandidate(r);
      // The third deliberate difference: with bought-in-past-month, the port judges demand on it
      // (scorecard line 2 and Gate 2's demand check); Gatekeeper always used rank drops. Parity is
      // checked without it; the bought rules have their own test below.
      delete f.bought;
      const S = refSettings(ours_S, date) as Settings;
      const ours = evaluate(f, cat, ours_S, card, date);
      const theirsGates = ref.GATES.map((g) => {
        const rows = ref.gateChecks(g, f, S, cat);
        return { rows, status: ref.gateStatus(rows) };
      });
      // Gatekeeper leaves two details as numbers (it renders them as text); the port keeps text.
      const asText = (rows: unknown[]) => (rows as { detail: unknown }[]).map((x) => ({ ...x, detail: String(x.detail) }));
      // Gate 7's label shows the capital in whole pounds and says where it came from ("Whole launch fits £1,000 with buffer (launch capital, Settings → Business)"); its own test is below.
      // Gate 1's review check says it reads the newest third.
      const sameLabel = (rows: { label: string }[]) => rows.map((x) => ({ ...x, label: x.label.replace(/^Whole launch fits £.* with buffer.*$/, "Whole launch fits capital with buffer").replace(" (newest third)", "") }));
      expect(ours.gates.map((g) => sameLabel(g.rows))).toEqual(theirsGates.map((g) => sameLabel(asText(g.rows) as unknown as { label: string }[])));
      expect(ours.gates.map((g) => g.status)).toEqual(theirsGates.map((g) => g.status));
      const sc = ref.scorecard(f, S, cat);
      // The app's reads-only lines (search-term conversion) are outside Gatekeeper's ten.
      const why = (rows: { why: string[] }[]) => rows.map((r) => ({ ...r, why: r.why.map((w) => w.replace(/^Newest third: m/, "M").replace(/^Newest third: s/, "S")) }));
      expect({ ...ours.sc, rows: why(ours.sc.rows.filter((r) => !r.info)) }).toEqual(sc);
      // The structural "Drop it" names only the weak structural lines; same class and title.
      const theirV = ref.verdict(sc, theirsGates) as { cls: string; title: string; text: string };
      if (/structural/.test(theirV.text)) expect({ ...ours.v, text: ours.v.text.split(", and the weak")[0] }).toEqual({ ...theirV, text: theirV.text.split(", and the weak")[0] });
      else expect(ours.v).toEqual(theirV);

      const e = econ(f, ours_S, cat, card, date), t = ref.econ(f, S, cat);
      expect(e?.peak ?? peakOn(date)).toBe(peakOn(date));
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

  it("differs from Gatekeeper only where intended: storage with VAT and DSF, peak by date", () => {
    const f: Fields = { sell: "24", landed: "5", weight: "300", dimL: "30", dimW: "20", dimH: "8", adsLaunch: "4", adsSteady: "1.5" };
    const S = { ...DEFAULT_SETTINGS };
    const july = new Date(Date.UTC(2026, 6, 15)), nov = new Date(Date.UTC(2026, 10, 15));
    const m = (1 + S.vat / 100) * (1 + S.dst / 100);
    // 1. Storage: Gatekeeper's ex-VAT figure × (1 + VAT) × (1 + DSF), and the profit lower by the difference.
    const g = original.econ(f, { ...S, q4: 0 } as Settings, "Home Products")!;
    const e = econ(f, S, "Home Products", card, july)!;
    expect(e.storageBase).toBeCloseTo(g.storage as number, 9);
    expect(e.storage!).toBeCloseTo((g.storage as number) * m, 9);
    expect(e.pS!).toBeCloseTo((g.pS as number) - (g.storage as number) * (m - 1), 9);
    // 2. Peak: November is peak with no setting; July isn't.
    expect(e.peak).toBe(false);
    const p = econ(f, S, "Home Products", card, nov)!;
    expect(p.peak).toBe(true);
    expect(p.fbaSource).toBe("peak"); // a small parcel: the peak surcharge applies
    expect(p.fbaBase).toBeCloseTo(e.fbaBase! + 0.11, 9);
    expect(p.storageBase!).toBeCloseTo((original.econ(f, { ...S, q4: 1 } as Settings, "Home Products")!.storage as number), 9);
    // Still Gatekeeper's: no dimensions, no FBA fee (no assumed tier).
    const noDims = econ({ sell: "24", landed: "5" }, S, "Home Products", card, july)!;
    expect([noDims.tier, noDims.fbaBase, noDims.fbaV, noDims.storage]).toEqual([null, null, null, null]);
  });

  it("never lets a good score override a failed gate", () => {
    const sc = scorecard({}, DEFAULT_SETTINGS, "Home Products", card);
    const full = { ...sc, answered: 10, total: 27 };
    expect(verdict(full, [{ status: "pass" }, { status: "fail" }]).title).toBe("Strong score, but a gate failed");
    expect(verdict(full, [{ status: "pass" }, { status: "warn" }]).title).toBe("Order samples");
    expect(gateStatus(gateChecks("g6", {}, DEFAULT_SETTINGS, "Home Products", card))).toBe("empty");
  });
});

describe("Gate 7's capital", () => {
  const f: Fields = { units: "300", landed: "2.50", samples: "60", inspection: "150", photography: "200", trademark: "170", launchAds: "400" };
  // (750 + 980) × 1.1 = 1,903.
  const g7 = (f2: Fields, S: Settings = DEFAULT_SETTINGS) => gateChecks("g7", f2, S, "Home Products", card)[0];

  it("uses the business's launch capital, £1,000 by default, and shows it in the label", () => {
    expect(capitalFor(f, DEFAULT_SETTINGS)).toEqual({ amount: 1000, own: false });
    expect(g7(f)).toMatchObject({ label: "Whole launch fits £1,000 with buffer (launch capital, Settings → Business)", status: "fail" });
    const S = { ...DEFAULT_SETTINGS, budget: 2000 };
    expect(g7(f, S)).toMatchObject({ label: "Whole launch fits £2,000 with buffer (launch capital, Settings → Business)", status: "pass" });
    expect(budget(f, S)).toMatchObject({ budget: 2000, ownCapital: false });
  });

  it("a candidate's own capital takes priority when set", () => {
    const own = { ...f, capital: "1700" };
    expect(capitalFor(own, { ...DEFAULT_SETTINGS, budget: 5000 })).toEqual({ amount: 1700, own: true });
    // 1,903 is within 15% over 1,700: a warning.
    expect(g7(own, { ...DEFAULT_SETTINGS, budget: 5000 })).toMatchObject({ label: "Whole launch fits £1,700 with buffer (this launch's capital)", status: "warn" });
    expect(scorecard(own, { ...DEFAULT_SETTINGS, budget: 5000 }, "Home Products", card).rows.find((r) => r.n === 9)!.pts).toBe(1);
    // Blank or zero falls back to the business's.
    expect(capitalFor({ ...f, capital: "" }, DEFAULT_SETTINGS).own).toBe(false);
    expect(capitalFor({ ...f, capital: "0" }, DEFAULT_SETTINGS).own).toBe(false);
  });
});

describe("copy follows the effective capital", () => {
  const g1 = GATES.find((g) => g.id === "g1")!;

  it("Gate 1's description names the candidate's capital: its own, else the business's", () => {
    expect(g1.blurb).not.toMatch(/£1,000/);
    expect(gateBlurb(g1, {}, DEFAULT_SETTINGS)).toBe("The top listings for the niche. You are judging whether £1,000 can buy a place on page one.");
    expect(gateBlurb(g1, {}, { ...DEFAULT_SETTINGS, budget: 2500 })).toMatch(/whether £2,500 can buy/);
    expect(gateBlurb(g1, { capital: "1750.5" }, { ...DEFAULT_SETTINGS, budget: 2500 })).toMatch(/whether £1,750\.50 can buy/);
    expect(gateBlurb(g1, { capital: "" }, { ...DEFAULT_SETTINGS, budget: 3000 })).toMatch(/whether £3,000 can buy/);
  });

  it("no gate's copy hardcodes £1,000 any more", () => {
    for (const g of GATES) expect(gateBlurb(g, {}, { ...DEFAULT_SETTINGS, budget: 4200 }), g.id).not.toMatch(/£1,000|{capital}/);
    expect(capitalText(1000)).toBe("£1,000");
    expect(capitalText(1250.5)).toBe("£1,250.50");
  });
});

describe("the verdict names only the weak structural lines", () => {
  const rows = scorecard({}, DEFAULT_SETTINGS, "Home Products", card).rows.filter((r) => !r.info);
  const with_ = (pts: Record<number, number>) => ({ rows: rows.map((r) => ({ ...r, pts: pts[r.n] ?? 2 })), total: 20, answered: 10 });

  it("lists the structural lines that scored 0 or 1, not all four", () => {
    const v = verdict(with_({ 1: 1, 3: 3, 7: 3, 10: 3 }), [{ status: "pass" }]);
    expect(v).toMatchObject({ cls: "fail", title: "Drop it" });
    expect(v.text).toBe("20/30, and the weak line is structural: 1. Page-one review depth (1/3). It can't be fixed by trying harder.");
    expect(v.text).not.toMatch(/demand stability|price multiple|competitive risk/i);
    const two = verdict(with_({ 1: 1, 3: 3, 7: 0, 10: 2 }), [{ status: "pass" }]);
    expect(two.text).toBe("20/30, and the weak lines are structural: 1. Page-one review depth (1/3), 7. Price multiple (sell ÷ landed) (0/3). They can't be fixed by trying harder.");
  });

  it("no weak structural line: the movable-lines verdict", () => {
    expect(verdict(with_({ 1: 2, 3: 3, 7: 2, 10: 2 }), [{ status: "pass" }]).title).toBe("Samples only if you can move the weak lines");
  });
});
