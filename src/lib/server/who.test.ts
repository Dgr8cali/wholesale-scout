import { describe, expect, it } from "vitest";
import { whoOf } from "./who";

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe("who confirmed an action", () => {
  it("how the proxy let the request in; the address and the browser", () => {
    const w = whoOf(req({ "x-ws-auth": "you (passkey)", authorization: "Bearer s3cret", "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "Safari" }));
    expect(w).toEqual({ actor: "you (passkey)", ip: "203.0.113.5", user_agent: "Safari" });
    expect(JSON.stringify(w)).not.toContain("s3cret");
  });
  it("no label: a plain one", () => {
    expect(whoOf(req({})).actor).toBe("you (signed in)");
  });
});
