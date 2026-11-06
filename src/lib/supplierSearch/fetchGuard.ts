/**
 * Fetch a page whose address came from a search engine, so treat the address as hostile: http and
 * https on normal ports only, no private or link-local addresses (checked when the connection is
 * made, so DNS rebinding can't slip past), never this server, every redirect re-checked, size and
 * time capped. Used by the supplier search spike; build step 3 reuses it.
 */
import { promises as dns } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

export const USER_AGENT = "WholesaleScoutSpike/0.1";

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 96], ["64:ff9b::", 96], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, bits, "ipv6");
// This server's public address: it also hosts Supabase and KaliStudio.
blocked.addAddress("89.58.38.2", "ipv4");

/** "::ffff:7f00:1" and "::ffff:127.0.0.1" are IPv4 addresses in disguise. */
function unwrapMapped(ip: string): string {
  const low = ip.toLowerCase();
  const dotted = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return ip;
  const a = parseInt(hex[1], 16), b = parseInt(hex[2], 16);
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

export function isBlockedAddress(ip: string): boolean {
  const plain = unwrapMapped(ip);
  const family = isIP(plain);
  if (!family) return true;
  return blocked.check(plain, family === 4 ? "ipv4" : "ipv6");
}

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|dgr8cali\.co\.uk)$/;

export function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "not a valid address" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: `${url.protocol} isn't allowed` };
  if (url.username || url.password) return { ok: false, reason: "address carries a user name or password" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: `port ${url.port} isn't allowed` };
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(host)) return isBlockedAddress(host) ? { ok: false, reason: `address ${host} is blocked` } : { ok: true, url };
  if (!host.includes(".") || BLOCKED_HOST.test(host)) return { ok: false, reason: `host ${host} is blocked` };
  return { ok: true, url };
}

export class BlockedAddressError extends Error {}

type Resolved = { address: string; family: number };
export type Resolve = (host: string) => Promise<Resolved[]>;
/** The shape Node's http(s).request takes as its `lookup` option. */
export type GuardedLookup = (hostname: string, options: { all?: boolean }, callback: (err: Error | null, address?: string | Resolved[], family?: number) => void) => void;

const systemResolve: Resolve = (host) => dns.lookup(host, { all: true });

/** Resolves a host and refuses it if ANY of its addresses is blocked. */
function guardedLookup(resolve: Resolve): GuardedLookup {
  return (hostname, options, callback) => {
    resolve(hostname).then((found) => {
      const bad = found.find((a) => isBlockedAddress(a.address));
      if (bad) return callback(new BlockedAddressError(`${hostname} resolves to a blocked address`));
      if (!found.length) return callback(new Error(`${hostname} didn't resolve`));
      if (options.all) callback(null, found);
      else callback(null, found[0].address, found[0].family);
    }, (e: Error) => callback(e));
  };
}

export type RawSend = (url: URL, lookup: GuardedLookup) => Promise<{ status: number; headers: Record<string, string>; body: Buffer; truncated: boolean }>;

export type SafeFetchResult =
  | { status: "ok"; finalUrl: string; html: string; truncated: boolean }
  | { status: "blocked" | "error" | "http_error" | "not_html"; reason: string };

export function nodeSend(maxBytes: number, timeoutMs: number): RawSend {
  return (url, lookup) => new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: "GET", lookup: lookup as never, agent: false, timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml", "accept-encoding": "gzip, deflate, br" },
    }, (res) => {
      const headers = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")]));
      const enc = headers["content-encoding"];
      // The cap counts bytes after decompression, so a small "zip bomb" can't get through.
      const stream = enc === "gzip" ? res.pipe(createGunzip()) : enc === "deflate" ? res.pipe(createInflate()) : enc === "br" ? res.pipe(createBrotliDecompress()) : res;
      const chunks: Buffer[] = [];
      let size = 0, done = false;
      const finish = (truncated: boolean) => { if (done) return; done = true; resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks), truncated }); };
      stream.on("data", (c: Buffer) => {
        if (done) return;
        const room = maxBytes - size;
        chunks.push(c.length > room ? c.subarray(0, room) : c);
        size += c.length;
        if (size >= maxBytes) { finish(true); req.destroy(); }
      });
      stream.on("end", () => finish(false));
      stream.on("error", (e) => { if (!done) { done = true; reject(e); } });
      res.on("error", (e) => { if (!done) { done = true; reject(e); } });
    });
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on("error", reject);
    req.end();
  });
}

function decodeBody(body: Buffer, contentType: string): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const fromMeta = fromHeader ? null : body.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try { return new TextDecoder(fromHeader ?? fromMeta ?? "utf-8").decode(body); }
  catch { return new TextDecoder("utf-8").decode(body); }
}

export async function safeFetch(url: string, opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; send?: RawSend; resolve?: Resolve; anyType?: boolean } = {}): Promise<SafeFetchResult> {
  const { maxBytes = 2_000_000, timeoutMs = 15_000, maxRedirects = 3, resolve = systemResolve } = opts;
  const send = opts.send ?? nodeSend(maxBytes, timeoutMs);
  const lookup = guardedLookup(resolve);
  let current = url;
  for (let redirects = 0; ; redirects++) {
    const checked = checkUrl(current);
    if (!checked.ok) return { status: "blocked", reason: checked.reason };
    let res: Awaited<ReturnType<RawSend>>;
    try { res = await send(checked.url, lookup); }
    catch (e) {
      if (e instanceof BlockedAddressError) return { status: "blocked", reason: e.message };
      return { status: "error", reason: (e as Error).message };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (redirects >= maxRedirects) return { status: "error", reason: `more than ${maxRedirects} redirects` };
      try { current = new URL(res.headers.location, checked.url).href; }
      catch { return { status: "error", reason: "a redirect to an invalid address" }; }
      continue;
    }
    if (res.status < 200 || res.status >= 300) return { status: "http_error", reason: `status ${res.status}` };
    const type = res.headers["content-type"] ?? "";
    if (!opts.anyType && !/text\/html|application\/xhtml\+xml/i.test(type)) return { status: "not_html", reason: type || "no content type" };
    return { status: "ok", finalUrl: checked.url.href, html: decodeBody(res.body, type), truncated: res.truncated };
  }
}
