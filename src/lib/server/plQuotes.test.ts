/** Choosing a supplier from the comparison: the old choice goes back to received, and the gates follow, asking before replacing your own values. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { createCandidate, setField } from "./pl";
import { GENERIC_CRITERIA, LENS_CRITERIA, LENS_SPEC } from "../pl/quotes";
import { applyQuote, candidateExtras, chooseQuote, createQuote, quoteLabels, saveQuoteLabels } from "./plQuotes";

describe("choosing a quote (FakeDb)", () => {
  let fake: FakeDb;
  beforeEach(() => { fake = new FakeDb(); __setDbForTests(fake); });
  afterEach(() => __setDbForTests(null));
  const field = (id: string, key: string) => fake.tables.pl_candidate_fields.find((f) => f.candidate_id === id && f.key === key);

  it("the old choice becomes received; your own landed cost stays unless you say to replace it", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", asins: [] });
    const tina = await createQuote(c.id, { supplier_name: "Tina", unit_price: 2.25, moq: 500, extras: { cards: 10 }, calc: { fx: 1.27, freight: 469.29, vat: false } });
    const sophia = await createQuote(c.id, { supplier_name: "Sophia", unit_price: 2.9, moq: 500, extras: { plate: 90, cards: 55, shrink: 15 }, calc: { fx: 1.27, freight: 566.93, vat: false }, transit_days: 45, next_tier_qty: 1000, next_tier_price: 2.85, freight_mode: "sea", ddp: true });
    await chooseQuote(tina.id, false);
    await setField(c.id, "landed", "2.50");

    await chooseQuote(sophia.id, false);
    const status = (id: string) => fake.tables.pl_quotes.find((q) => q.id === id)!.status;
    expect([status(tina.id), status(sophia.id)]).toEqual(["received", "chosen"]);

    const kept = await applyQuote(sophia.id, "gate7");
    expect(kept).toMatchObject({ written: ["units"], kept: ["landed"] });
    expect(field(c.id, "landed")).toMatchObject({ value: "2.50", source: "manual" });

    const replaced = await applyQuote(sophia.id, "gate7", ["landed"]);
    expect(replaced.written.sort()).toEqual(["landed", "units"]);
    expect(field(c.id, "landed")).toMatchObject({ value: "3.67", source: "quote" });
    expect(field(c.id, "units")).toMatchObject({ value: "500", source: "quote" });
  });

  it("the new fields are checked", async () => {
    const c = await createCandidate({ name: "X", asins: [] });
    await expect(createQuote(c.id, { freight_mode: "boat" })).rejects.toThrow(/Freight/);
    const q = await createQuote(c.id, { sample_scores: { moisture: 9, smell: 4, note: " fresh " }, spec: { wipe: "12 × 15 cm", junk: "x" }, sample_received_on: "not a date" });
    expect(q).toMatchObject({ sample_scores: { smell: 4, note: "fresh" }, spec: { wipe: "12 × 15 cm" }, sample_received_on: null });
  });

  it("labels: generic until set; renamed per candidate; the scores stay under their key; reset", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", asins: [] });
    expect((await quoteLabels(c.id)).criteria).toEqual(GENERIC_CRITERIA);
    await saveQuoteLabels(c.id, { criteria: LENS_CRITERIA, spec: LENS_SPEC });
    await createQuote(c.id, { supplier_name: "Sophia", sample_scores: { smell: 4 } });
    const renamed = await saveQuoteLabels(c.id, { criteria: LENS_CRITERIA.map((l) => (l.k === "smell" ? { k: l.k, label: "Scent" } : l)) });
    expect(renamed.criteria.find((l) => l.k === "smell")!.label).toBe("Scent");
    const x = await candidateExtras(c.id);
    expect(x.labels.criteria[2].label).toBe("Scent");
    expect(x.quotes[0].sample_scores).toMatchObject({ smell: 4 });
    expect((await saveQuoteLabels(c.id, { reset: true })).criteria).toEqual(GENERIC_CRITERIA);
  });

  it("freight options: one used, the single fields follow it, and the landed cost uses it", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", asins: [] });
    const q = await createQuote(c.id, {
      supplier_name: "Sophia", unit_price: 2.9, moq: 500, currency: "USD", extras: { plate: 90, cards: 55, shrink: 15 }, calc: { fx: 1.27, vat: false },
      freight_options: [
        { mode: "sea", ddp: true, cost: 720, currency: "USD", transit_days: 45, used: true },
        { mode: "rail", ddp: null, cost: 830, currency: "USD", transit_days: 35, used: true },
        { mode: "air", ddp: null, cost: 2830, currency: "USD", transit_days: null },
      ],
    });
    expect(q.freight_options!.map((o) => o.used)).toEqual([true, false, false]);
    expect(q).toMatchObject({ freight_mode: "sea", ddp: true, transit_days: 45 });
    const r = await applyQuote(q.id, "gate0");
    expect(r.perUnit).toBe(3.67);
    await expect(createQuote(c.id, { freight_options: [{ mode: "boat", currency: "USD" }] })).rejects.toThrow(/Freight option 1/);
  });
});
