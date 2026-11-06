import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeSend, safeFetch, type GuardedLookup } from "./fetchGuard";

// The real sender against a server on this machine. Nothing leaves the machine.
const allowAll: GuardedLookup = (_h, o, cb) => (o.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4));
let server: Server, base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/gzip") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync("<p>unzipped</p>")); return; }
    if (req.url === "/bomb") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync(Buffer.alloc(5_000_000, "a"))); return; }
    if (req.url === "/hang") return;
    res.writeHead(200, { "content-type": "text/html" }); res.end(`ua=${req.headers["user-agent"]}`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

describe("nodeSend", () => {
  it("sends the generic user agent", async () => {
    const r = await nodeSend(1000, 5000)(new URL(`${base}/`), allowAll);
    expect(r.body.toString()).toBe("ua=WholesaleScoutSpike/0.1");
  });
  it("unzips a gzip answer", async () => {
    const r = await nodeSend(1000, 5000)(new URL(`${base}/gzip`), allowAll);
    expect(r.body.toString()).toBe("<p>unzipped</p>");
  });
  it("caps the size after unzipping", async () => {
    const r = await nodeSend(1000, 5000)(new URL(`${base}/bomb`), allowAll);
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(1000);
  });
  it("gives up on a page that never answers", async () => {
    await expect(nodeSend(1000, 200)(new URL(`${base}/hang`), allowAll)).rejects.toThrow();
  });
});

describe("safeFetch with the real sender", () => {
  it("a public-looking name that resolves to this machine is blocked at connect time", async () => {
    const r = await safeFetch("http://rebind.example/", { resolve: async () => [{ address: "127.0.0.1", family: 4 }] });
    expect(r.status).toBe("blocked");
  });
  it("one private address among several is enough to block", async () => {
    const r = await safeFetch("http://rebind.example/", { resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }] });
    expect(r.status).toBe("blocked");
  });
});
