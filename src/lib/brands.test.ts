import { describe, expect, it } from "vitest";
import { brandKey } from "./brands";

describe("brand keys", () => {
  it("normalises brand keys", () => {
    expect(brandKey("La Roche-Posay")).toBe(brandKey("LA ROCHE POSAY"));
    expect(brandKey("Nuxe")).toBe("nuxe");
    expect(brandKey("Sébium")).toBe("sebium");
  });
});
