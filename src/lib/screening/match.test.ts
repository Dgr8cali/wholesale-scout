import { describe, expect, it } from "vitest";
import { doubtfulMatch } from "./match";

const sheet = (brand: string, title: string) => ({ brand, title });

describe("doubtful match (live examples from the first run)", () => {
  it("flags the Onagrine CC cream on the Bioderma Sébium EAN, though Amazon's brand agrees", () => {
    const s = sheet("Bioderma", "Bioderma Sébium Purifying and Foaming Cleansing Gel 500 ml");
    expect(doubtfulMatch(s, { brand: "Bioderma", title: "Bioderma Sebium Purifying Cleansing Foaming Gel 500ml" })).toBeNull();
    expect(doubtfulMatch(s, { brand: "Bioderma", title: "Onagrine CC Cream Extreme Perfection Complexion Perfecting Care 40ml - Dark" }))
      .toMatch(/shares nothing/);
  });

  it("flags a clashing brand the title doesn't back up", () => {
    expect(doubtfulMatch(sheet("Bioderma", "Bioderma Sébium Gel 500 ml"), { brand: "Onagrine", title: "Onagrine CC Cream 40ml" }))
      .toBe("Amazon lists this as Onagrine, the sheet says Bioderma");
  });

  it("keeps listings that are the same product in other words", () => {
    const cases: [string, string, string, string][] = [
      ["La Roche-Posay", "La Rocheposay Lipikar Baume Ap M Relipidation Balm 400 Ml", "Delta Children", "La Roche Lipikar Baume AP+M w/ Pump"],
      ["Embryolisse", "Embryolisse Lait-Creme Concentre Nourishing And Moisturizing", "Embryolisse", "Embryolisse Concentrated Milk Cream 75ml Aloe Vera (Packaging May Vary)"],
      ["Martiderm", "Martiderm Acniover Cleansing Gel 200ml Purifying Gel For Face", "Martiderm", "Martiderm Face Cleansing Gel 200 ml"],
      ["NUXE", "Nuxe Creme Prodigieuse Boost Multicorrection Gel Cream 40ml", "Nuxe", "Nuxe Face Night Cream 40 ml (Pack of 1)"],
      ["Filorga", "Filorga Liftstructure Ultralifting Cream 50ml", "Filorga", "Lift-Structure Ultra-Lifting Day Cream"],
      ["Skinceuticals", "SKINCEUTICALS Serum 10 Double Antioxidant 30ml", "SKINCEUTICALS", "SkinCeuticals Serum 10"],
      ["Vichy", "Vichy Antiperspirant Sensitive Deo Rollon 48 Hours 50 Ml", "VICHY", "VICHY Deodorant Roll-on, Sensitive Skin, 50 ml"],
    ];
    for (const [sb, st, ab, at] of cases) expect(doubtfulMatch(sheet(sb, st), { brand: ab, title: at }), at).toBeNull();
  });

  it("says nothing when the sheet has no brand or title to compare", () => {
    expect(doubtfulMatch({ brand: null, title: null }, { brand: "X", title: "Anything at all" })).toBeNull();
  });
});
