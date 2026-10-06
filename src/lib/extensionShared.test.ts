// @vitest-environment node
/**
 * extension/shared.js after the extension is reloaded: the scripts left in open tabs lose their
 * connection, and every chrome.* call throws "Extension context invalidated". Nothing must throw.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "../../extension/shared.js"), "utf8");
type Ws = {
  alive: () => boolean; send: (m: unknown) => Promise<{ ok: boolean; error?: string }>; staleNotice: () => void;
  store: { get: (k: unknown) => Promise<Record<string, unknown>>; set: (i: unknown) => Promise<void> };
  observe: (t: Node, o: MutationObserverInit, cb: () => void) => MutationObserver; h: (tag: string, attrs?: Record<string, unknown>) => HTMLElement;
};

/** shared.js in a page whose `chrome` behaves as given. */
function page(chrome: Record<string, unknown>) {
  const dom = new JSDOM(`<body><div id="wholesale-scout-reviews"><button>Send</button></div><span class="ws-badge">B</span></body>`, { runScripts: "outside-only" });
  const w = dom.window as unknown as { chrome: unknown; eval: (s: string) => void; __ws: Ws; document: Document };
  w.chrome = chrome;
  w.eval(src);
  return w;
}
const invalidated = () => { throw new Error("Extension context invalidated."); };

describe("extension shared.js when the extension is reloaded", () => {
  it("alive while connected; send works", async () => {
    const w = page({ runtime: { id: "abc", lastError: undefined, sendMessage: (_m: unknown, cb: (r: unknown) => void) => cb({ ok: true }) }, storage: { local: { get: async () => ({ a: 1 }) } } });
    expect(w.__ws.alive()).toBe(true);
    expect(await w.__ws.send({ type: "x" })).toEqual({ ok: true });
  });

  it("gone (no runtime id): send resolves stale, storage gives defaults, one note, our panels hidden and disabled", async () => {
    const w = page({ runtime: { get id() { return undefined; }, sendMessage: invalidated }, storage: { local: { get: invalidated, set: invalidated } } });
    expect(w.__ws.alive()).toBe(false);
    expect(await w.__ws.send({ type: "x" })).toEqual({ ok: false, error: "stale" });
    expect(await w.__ws.send({ type: "y" })).toEqual({ ok: false, error: "stale" });
    expect(await w.__ws.store.get({ panelOpen: true })).toEqual({ panelOpen: true });
    await w.__ws.store.set({ a: 1 });
    const d = w.document;
    expect(d.querySelectorAll("#wholesale-scout-stale")).toHaveLength(1);
    expect(d.getElementById("wholesale-scout-stale")!.textContent).toBe("Wholesale Scout was updated — refresh this page to use it.");
    expect((d.getElementById("wholesale-scout-reviews") as HTMLElement).style.display).toBe("none");
    expect((d.querySelector("#wholesale-scout-reviews button") as HTMLButtonElement).disabled).toBe(true);
    expect((d.querySelector(".ws-badge") as HTMLElement).style.display).toBe("none");
  });

  it("sendMessage throwing, or lastError saying so, counts as gone", async () => {
    const throws = page({ runtime: { id: "abc", sendMessage: invalidated } });
    expect(await throws.__ws.send({})).toEqual({ ok: false, error: "stale" });
    const viaLastError = page({ runtime: { id: "abc", lastError: { message: "Extension context invalidated." }, sendMessage: (_m: unknown, cb: (r: unknown) => void) => cb(undefined) } });
    expect(await viaLastError.__ws.send({})).toEqual({ ok: false, error: "stale" });
    const other = page({ runtime: { id: "abc", lastError: { message: "Something else" }, sendMessage: (_m: unknown, cb: (r: unknown) => void) => cb(undefined) } });
    expect(await other.__ws.send({})).toEqual({ ok: false, error: "Something else" });
  });

  it("observers disconnect themselves, and our handlers do nothing, once it's gone", async () => {
    const rt = { id: "abc" as string | undefined };
    const w = page({ runtime: { get id() { return rt.id; }, sendMessage: invalidated } });
    let calls = 0, clicks = 0;
    w.__ws.observe(w.document.body, { childList: true, subtree: true }, () => { calls++; });
    const b = w.__ws.h("button", { onclick: () => { clicks++; } });
    w.document.body.append(b);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1);
    b.click();
    expect(clicks).toBe(1);
    rt.id = undefined; // the extension is reloaded
    w.document.body.append(w.document.createElement("p"));
    await new Promise((r) => setTimeout(r, 0));
    w.document.body.append(w.document.createElement("p"));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1);
    b.click();
    expect(clicks).toBe(1);
    expect(w.document.querySelectorAll("#wholesale-scout-stale")).toHaveLength(1);
  });
});
