import { describe, expect, it } from "vitest";
import { whoOf } from "./who";

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe("who confirmed an action", () => {
  it("the sign-in name, never the password; the address and the browser", () => {
    const w = whoOf(req({ authorization: `Basic ${btoa("akin:s3cret-pass")}`, "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "Safari" }));
    expect(w).toEqual({ actor: "akin", ip: "203.0.113.5", user_agent: "Safari" });
    expect(JSON.stringify(w)).not.toContain("s3cret");
  });
  it("no name typed, or a bearer token: a plain label", () => {
    expect(whoOf(req({ authorization: `Basic ${btoa(":s3cret")}` })).actor).toBe("you (signed in)");
    expect(whoOf(req({ authorization: "Bearer s3cret" })).actor).toBe("app password (script or extension)");
    expect(JSON.stringify(whoOf(req({ authorization: "Bearer s3cret" })))).not.toContain("s3cret");
  });
});
