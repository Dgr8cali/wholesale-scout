import { beforeEach, describe, expect, it } from "vitest";
import { __resetQogitaToken, QogitaClient, variantFid } from "./client";

type Call = { url: string; method: string; auth?: string; body?: unknown };

function fakeApi(handler: (c: Call, n: number) => { status?: number; json?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  let logins = 0;
  const f = async (url: string, init?: RequestInit) => {
    const call: Call = { url, method: init?.method ?? "GET", auth: (init?.headers as Record<string, string> | undefined)?.Authorization, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    if (url.endsWith("/auth/login/")) {
      logins++;
      return new Response(JSON.stringify({ accessToken: `t${logins}`, accessExp: Date.now() + 5 * 60_000 }), { status: 200 });
    }
    calls.push(call);
    const r = handler(call, calls.length);
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers });
  };
  return { f, calls, logins: () => logins };
}

describe("Qogita client", () => {
  beforeEach(() => __resetQogitaToken());
  const sleeps: number[] = [];
  const client = (f: (u: string, i?: RequestInit) => Promise<Response>) => new QogitaClient("a@b.c", "pw", f, async (ms) => { sleeps.push(ms); }, () => {});

  it("logs in once and reuses the token", async () => {
    const api = fakeApi(() => ({ json: { results: [] } }));
    const c = client(api.f);
    await c.allocations();
    await c.allocations();
    expect(api.logins()).toBe(1);
    expect(api.calls.every((x) => x.auth === "Bearer t1")).toBe(true);
  });

  it("logs in again once on a 401 and retries", async () => {
    const api = fakeApi((_c, n) => (n === 1 ? { status: 401, json: { message: "expired" } } : { json: { results: [] } }));
    await client(api.f).allocations();
    expect(api.logins()).toBe(2);
    expect(api.calls.map((x) => x.auth)).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("waits Retry-After on a 429", async () => {
    sleeps.length = 0;
    const api = fakeApi((_c, n) => (n === 1 ? { status: 429, headers: { "retry-after": "7" } } : { json: { results: [] } }));
    await client(api.f).allocations();
    expect(sleeps).toEqual([7000]);
    expect(api.calls).toHaveLength(2);
  });

  it("pages products with snake_case filters and follows next links over https", async () => {
    const api = fakeApi((c) => c.url.includes("page=2")
      ? { json: { count: 3, next: null, results: [{ gtin: "3" }] } }
      : { json: { count: 3, next: "http://api.qogita.com/public/buyers/products/?page=2", results: [{ gtin: "1" }, { gtin: "2" }] } });
    const got: string[] = [];
    for await (const p of client(api.f).products({ categoryNames: ["Face Cream", "Sheet Mask"], brandNames: ["Nivea"] })) got.push(...p.results.map((r) => r.gtin));
    expect(got).toEqual(["1", "2", "3"]);
    const first = new URL(api.calls[0].url);
    expect(first.searchParams.getAll("category_name")).toEqual(["Face Cream", "Sheet Mask"]);
    expect(first.searchParams.get("brand_name")).toBe("Nivea");
    expect(first.searchParams.get("stockAvailability")).toBe("in_stock");
    expect(first.searchParams.get("page_size")).toBe("500");
    expect(api.calls[1].url.startsWith("https://")).toBe(true);
  });

  it("sends cart writes with the documented bodies", async () => {
    const api = fakeApi(() => ({ json: {} }));
    const c = client(api.f);
    await c.addLine("offer-1", 24);
    await c.updateLine("alloc-1", "line-1", 12);
    await c.deleteLine("alloc-1", "line-1");
    expect(api.calls.map((x) => [x.method, new URL(x.url).pathname, x.body])).toEqual([
      ["POST", "/carts/active/lines/", { offerQid: "offer-1", quantity: 24 }],
      ["PATCH", "/carts/active/allocations/alloc-1/lines/line-1/", { quantity: 12 }],
      ["DELETE", "/carts/active/allocations/alloc-1/lines/line-1/", undefined],
    ]);
  });

  it("treats an unknown brand slug as no brand", async () => {
    const api = fakeApi(() => ({ status: 400, json: { message: "Invalid Brand Slug(s)." } }));
    expect(await client(api.f).brandBySlug("nosuchbrand")).toBeNull();
  });

  it("reads the variant FID from a product link", () => {
    expect(variantFid("https://www.qogita.com/products/87356ab451ca40b8b0bb13a6f4dcc093/biodance-mask/")).toBe("87356ab451ca40b8b0bb13a6f4dcc093");
    expect(variantFid("https://www.qogita.com/products/")).toBeNull();
  });
});
