import { describe, expect, it } from "vitest";
import { buildQueries } from "./queries";

describe("buildQueries", () => {
  it("gives each product five queries, including a German one", () => {
    const qs = buildQueries({ id: "a", query: "bin bags", kind: "generic" });
    expect(qs).toHaveLength(5);
    expect(qs).toContainEqual({ q: "bin bags Großhandel", country: "DE", lang: "de" });
  });
  it("branded products search as wholesale, like generic ones", () => {
    expect(buildQueries({ id: "a", query: "Colgate", kind: "branded" })[0]).toEqual({ q: "Colgate wholesale UK", country: "GB", lang: "en" });
  });
  it("a manufacturer product searches China first and has a German route", () => {
    const qs = buildQueries({ id: "b", query: "pill box", kind: "manufacturer" });
    expect(qs).toHaveLength(5);
    expect(qs[0]).toEqual({ q: "pill box manufacturer China", country: "CN", lang: "en" });
    expect(qs).toContainEqual({ q: "pill box Hersteller", country: "DE", lang: "de" });
  });
});
