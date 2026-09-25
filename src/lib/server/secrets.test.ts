import { describe, expect, it } from "vitest";
import { bearerIs, redact } from "./secrets";

describe("secrets", () => {
  const env = { KEEPA_API_KEY: "k".repeat(64), APP_PASSWORD: "hunter22", DATABASE_URL: "postgres://u:p@h/db", NODE_ENV: "production", SHORT_TOKEN: "abc" } as unknown as NodeJS.ProcessEnv;
  it("redacts any secret's value from text", () => {
    expect(redact(`GET https://api.keepa.com/product?key=${env.KEEPA_API_KEY}&asin=B0 failed; pw hunter22; postgres://u:p@h/db`, env))
      .toBe("GET https://api.keepa.com/product?key=[redacted]&asin=B0 failed; pw [redacted]; [redacted]");
    expect(redact("production abc", env)).toBe("production abc");
  });
  it("checks a bearer secret", () => {
    expect(bearerIs("Bearer s3cret", undefined, "s3cret")).toBe(true);
    expect(bearerIs("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerIs("Bearer ", undefined)).toBe(false);
    expect(bearerIs(null, "x")).toBe(false);
  });
});
