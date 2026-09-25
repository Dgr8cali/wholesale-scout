import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, matchRules } from "./rules";

const keys = (text: string, cat?: string) => matchRules(DEFAULT_RULES, text, cat).map((m) => m.key);

describe("compliance rules", () => {
  it("flags fragrance as a flammable liquid from the row text alone", () => {
    expect(keys("Chanel No 5 Eau de Parfum 100ml")).toContain("fragrance");
    expect(keys("Hugo Boss Bottled EDT 50ml")).toContain("fragrance");
  });

  it("matches volumes with a regular expression keyword", () => {
    expect(keys("Chanteclair Sgrassatore Refill 600 ml")).toContain("liquid");
    expect(keys("Chanteclair Sgrassatore Refill 600ml")).toContain("liquid");
  });

  it("matches whole words only", () => {
    expect(keys("Oilskin jacket")).not.toContain("liquid"); // "oil" inside a word
    expect(keys("Walker Tape roll")).toEqual([]);
  });

  it("matches supplements and Amazon categories", () => {
    expect(keys("Paraflu 20 capsules")).toContain("supplement");
    expect(keys("Mystery item", "Grocery")).toContain("food");
  });
});
