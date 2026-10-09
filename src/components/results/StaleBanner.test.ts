import { describe, expect, it } from "vitest";
import { staleReason } from "./StaleBanner";

describe("stale screenings", () => {
  const now = { vatRegistered: true, priceBasis: "lower90" as const };
  it("on today's settings: not stale", () => {
    expect(staleReason({ priceBasis: "lower90", vatRegistered: true }, now)).toBeNull();
    expect(staleReason(null, now)).toBeNull();
  });
  it("another price basis, or none stored (the old default), or another VAT basis: stale, saying why", () => {
    expect(staleReason({ priceBasis: "current", vatRegistered: true }, now)).toBe("price basis Current Buy Box (now Conservative)");
    expect(staleReason({ outputVat: 0 }, now)).toBe("price basis Lower of current and 12-month median (now Conservative); not VAT registered (now VAT registered)");
    expect(staleReason({ priceBasis: "lower90", vatRegistered: true }, { vatRegistered: true, priceBasis: "current" })).toMatch(/now Current Buy Box/);
  });
});
