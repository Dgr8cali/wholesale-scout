import { describe, expect, it } from "vitest";
import { checkUrl, isBlockedAddress, safeFetch, type RawSend } from "./fetchGuard";

const htmlOk = (body = "<p>ok</p>"): Awaited<ReturnType<RawSend>> => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from(body), truncated: false });

describe("isBlockedAddress", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "89.58.38.2"])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
  it("blocks something that isn't an address", () => expect(isBlockedAddress("not-an-ip")).toBe(true));
});

describe("checkUrl", () => {
  it.each(["ftp://a.com/", "file:///etc/passwd", "http://a.com:8080/", "http://localhost/", "http://x.local/", "http://x.internal/", "http://2130706433/", "http://0x7f.0.0.1/", "http://[::1]/", "https://ws.dgr8cali.co.uk/", "https://db.dgr8cali.co.uk/", "https://dgr8cali.co.uk/", "http://user:pw@a.com/", "not a url"])("refuses %s", (u) => {
    expect(checkUrl(u).ok).toBe(false);
  });
  it.each(["https://example.com/p/1", "http://example.co.uk/", "https://example.com:443/"])("accepts %s", (u) => {
    expect(checkUrl(u).ok).toBe(true);
  });
});

describe("safeFetch", () => {
  it("returns the page and where it ended up", async () => {
    const r = await safeFetch("https://example.com/", { send: async () => htmlOk("<p>hello</p>") });
    expect(r).toEqual({ status: "ok", finalUrl: "https://example.com/", html: "<p>hello</p>", truncated: false });
  });
  it("refuses a bad address without sending anything", async () => {
    let sent = 0;
    const r = await safeFetch("http://127.0.0.1/", { send: async () => { sent++; return htmlOk(); } });
    expect(r.status).toBe("blocked");
    expect(sent).toBe(0);
  });
  it("re-checks every redirect and stops at a private target", async () => {
    const send: RawSend = async () => ({ status: 302, headers: { location: "http://169.254.169.254/latest" }, body: Buffer.alloc(0), truncated: false });
    expect((await safeFetch("https://example.com/", { send })).status).toBe("blocked");
  });
  it("follows a relative redirect", async () => {
    const seen: string[] = [];
    const send: RawSend = async (url) => { seen.push(url.href); return seen.length === 1 ? { status: 301, headers: { location: "/new" }, body: Buffer.alloc(0), truncated: false } : htmlOk(); };
    const r = await safeFetch("https://example.com/old", { send });
    expect(r.status === "ok" && r.finalUrl).toBe("https://example.com/new");
  });
  it("gives up after 3 redirects", async () => {
    let n = 0;
    const send: RawSend = async () => ({ status: 302, headers: { location: `https://example.com/${++n}` }, body: Buffer.alloc(0), truncated: false });
    expect((await safeFetch("https://example.com/", { send })).status).toBe("error");
    expect(n).toBe(4);
  });
  it("refuses a non-HTML answer", async () => {
    const send: RawSend = async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: Buffer.from("%PDF"), truncated: false });
    expect((await safeFetch("https://example.com/a.pdf", { send })).status).toBe("not_html");
  });
  it("reports a login or missing page as an HTTP error and goes no further", async () => {
    const send: RawSend = async () => ({ status: 403, headers: { "content-type": "text/html" }, body: Buffer.from("no"), truncated: false });
    expect((await safeFetch("https://example.com/", { send })).status).toBe("http_error");
  });
  it("a connection failure is an error, not a throw", async () => {
    const send: RawSend = async () => { throw new Error("ECONNRESET"); };
    expect((await safeFetch("https://example.com/", { send })).status).toBe("error");
  });
  it("a lookup refused by the guard counts as blocked", async () => {
    const send: RawSend = async (_url, lookup) => new Promise((_, reject) => lookup("evil.example", {}, (err) => reject(err ?? new Error("no error"))));
    const r = await safeFetch("https://evil.example/", { send, resolve: async () => [{ address: "10.0.0.5", family: 4 }] });
    expect(r.status).toBe("blocked");
  });
  it("passes on a truncated body", async () => {
    const send: RawSend = async () => ({ ...htmlOk(), truncated: true });
    const r = await safeFetch("https://example.com/", { send });
    expect(r.status === "ok" && r.truncated).toBe(true);
  });
});

describe("safeFetch page encodings", () => {
  it("reads a GBK page from its header", async () => {
    const gbk = Buffer.from([0xd6, 0xd0, 0xb9, 0xfa]); // 中国
    const r = await safeFetch("https://example.cn/", { send: async () => ({ status: 200, headers: { "content-type": "text/html; charset=gbk" }, body: gbk, truncated: false }) });
    expect(r.status === "ok" && r.html).toBe("中国");
  });
  it("reads a Latin-1 page from its meta tag", async () => {
    const body = Buffer.concat([Buffer.from('<meta charset="iso-8859-1"><p>Stra'), Buffer.from([0xdf]), Buffer.from("e</p>")]);
    const r = await safeFetch("https://example.de/", { send: async () => ({ status: 200, headers: { "content-type": "text/html" }, body, truncated: false }) });
    expect(r.status === "ok" && r.html).toContain("Straße");
  });
  it("an unknown charset falls back to UTF-8", async () => {
    const r = await safeFetch("https://example.com/", { send: async () => ({ status: 200, headers: { "content-type": "text/html; charset=nonsense" }, body: Buffer.from("é"), truncated: false }) });
    expect(r.status === "ok" && r.html).toBe("é");
  });
});

describe("safeFetch for plain files", () => {
  const send: RawSend = async () => ({ status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("User-agent: *"), truncated: false });
  it("reads a plain text file when asked to, for robots.txt", async () => {
    const r = await safeFetch("https://example.com/robots.txt", { send, anyType: true });
    expect(r.status === "ok" && r.html).toBe("User-agent: *");
  });
  it("still refuses plain text by default", async () => {
    expect((await safeFetch("https://example.com/robots.txt", { send })).status).toBe("not_html");
  });
});
