import { describe, expect, it } from "vitest";
import { keepSellerCentralMark } from "./rules";

describe("Amazon's DG data read again", () => {
  const fresh = { hazmat: null, ghs: ["GHS02"], declared: ["ORM-D"], heatSensitive: false };
  it("keeps the hazmat mark saved from Seller Central", () => {
    const old = { hazmat: null, ghs: [], declared: ["Seller Central: Class 2.1"], heatSensitive: false };
    expect(keepSellerCentralMark(fresh, old)).toEqual({ ...fresh, declared: ["ORM-D", "Seller Central: Class 2.1"] });
    expect(keepSellerCentralMark(null, old)?.declared).toEqual(["Seller Central: Class 2.1"]);
  });
  it("is the catalog's data when there's no mark", () => {
    expect(keepSellerCentralMark(fresh, null)).toBe(fresh);
    expect(keepSellerCentralMark(null, { ...fresh, declared: [] })).toBeNull();
  });
});
