import { describe, expect, it } from "vitest";
import { handle, TODAY_CACHE } from "./http";
import { memo } from "./memo";

describe("handle", () => {
  it("drops Today's cached facts after a write, not after a read or a failed write", async () => {
    let n = 0;
    const facts = () => memo(`${TODAY_CACHE}facts`, 60_000, async () => ++n);
    expect(await facts()).toBe(1);
    await handle(async (req: Request) => Response.json({ method: req.method }))(new Request("http://x/api/a", { method: "GET" }));
    expect(await facts()).toBe(1);
    await handle(async (req: Request) => Response.json({ method: req.method }, { status: 400 }))(new Request("http://x/api/a", { method: "POST" }));
    expect(await facts()).toBe(1);
    await handle(async (req: Request) => Response.json({ method: req.method }))(new Request("http://x/api/a", { method: "PATCH" }));
    expect(await facts()).toBe(2);
  });
});
