// Helpers shared by the content scripts (they run in one isolated world per page).
(() => {
  if (globalThis.__ws) return;
  const ws = {};
  // After the extension is reloaded or updated, the scripts already running in open tabs lose their
  // connection to it: any chrome.* call then throws "Extension context invalidated". Everything below
  // checks first and, once it's gone, goes quiet and asks for a refresh instead of throwing.
  /** The extension is still there for this page (false after it's reloaded or updated). */
  ws.alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const STALE = /context invalidated|Extension context|message port closed|Receiving end does not exist/i;
  let staleShown = false;
  /** Our own panels, badges and bars on the page. */
  const OURS = '[id^="wholesale-scout"], #ws-rank-panel, #ws-dg, .ws-badge';
  /** Once a page: a note asking for a refresh, and our panels and buttons hidden and disabled. */
  ws.staleNotice = () => {
    if (staleShown) return;
    staleShown = true;
    try {
      document.querySelectorAll(OURS).forEach((el) => {
        el.querySelectorAll("button, input, select, a").forEach((b) => { b.disabled = true; b.style.pointerEvents = "none"; });
        el.style.display = "none";
      });
      const note = document.createElement("div");
      note.id = "wholesale-scout-stale";
      note.textContent = "Wholesale Scout was updated — refresh this page to use it.";
      note.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:2147483001;background:#111;color:#fff;border-radius:8px;padding:8px 14px;font:13px/1.4 -apple-system,Segoe UI,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer";
      note.title = "Click to dismiss";
      note.addEventListener("click", () => note.remove());
      (document.body || document.documentElement).append(note);
      setTimeout(() => note.remove(), 12_000);
    } catch { /* the page went away */ }
  };
  /** A message to the extension; never throws: { ok: false, error: "stale" } once it's gone. */
  ws.send = (msg) => new Promise((resolve) => {
    const stale = () => { ws.staleNotice(); resolve({ ok: false, error: "stale" }); };
    if (!ws.alive()) return stale();
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        let err = null;
        try { err = chrome.runtime.lastError?.message || null; } catch (e) { err = String(e?.message || e); }
        if (err && STALE.test(err)) return stale();
        resolve(r || { ok: false, error: err || "No answer" });
      });
    } catch (e) {
      if (STALE.test(String(e?.message || e)) || !ws.alive()) return stale();
      resolve({ ok: false, error: String(e?.message || e) });
    }
  });
  /** chrome.storage.local that never throws: get gives `fallback` (an object of defaults, or a key's default) once the extension is gone. */
  ws.store = {
    async get(keys, fallback = {}) {
      if (!ws.alive()) { ws.staleNotice(); return typeof keys === "string" ? {} : { ...fallback, ...(keys && typeof keys === "object" && !Array.isArray(keys) ? keys : {}) }; }
      try { return await chrome.storage.local.get(keys); } catch { ws.staleNotice(); return typeof keys === "object" && keys && !Array.isArray(keys) ? { ...keys } : {}; }
    },
    async set(items) {
      if (!ws.alive()) return ws.staleNotice();
      try { await chrome.storage.local.set(items); } catch { ws.staleNotice(); }
    },
    async remove(keys) {
      if (!ws.alive()) return ws.staleNotice();
      try { await chrome.storage.local.remove(keys); } catch { ws.staleNotice(); }
    },
  };
  /**
   * A MutationObserver that disconnects itself (and asks for a refresh) once the extension is gone,
   * so an orphaned script stops working on the page. Returns the observer.
   */
  ws.observe = (target, options, callback) => {
    const obs = new MutationObserver((records) => {
      if (!ws.alive()) { obs.disconnect(); ws.staleNotice(); return; }
      try { callback(records, obs); } catch (e) { if (!ws.alive()) { obs.disconnect(); ws.staleNotice(); } else throw e; }
    });
    obs.observe(target, options);
    return obs;
  };
  /** A timeout that does nothing once the extension is gone. */
  ws.later = (fn, ms) => setTimeout(() => { if (ws.alive()) fn(); else ws.staleNotice(); }, ms);
  ws.api = (method, path, body) => ws.send({ type: "api", method, path, body });
  ws.gbp = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `£${Number(n).toFixed(2)}`);
  ws.num = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-GB"));
  // Times as the app shows them (src/lib/ui/when.ts): "2 h ago", "25 Sept 21:14", UK time.
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  ws.STALE_MS = 7 * DAY;
  ws.ago = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms)) return "";
    if (ms < MIN) return "just now";
    if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
    const d = Math.floor(ms / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  };
  ws.stamp = (iso) => {
    const t = new Date(iso);
    const date = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London", ...(t.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
    return `${date} ${t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
  };
  ws.isStale = (iso) => Date.now() - new Date(iso).getTime() > ws.STALE_MS;
  /** "last seen 12 Sept 2026 (13 days ago)". */
  ws.lastSeen = (days, at) => {
    if (!at) return days != null ? `last seen ${days} days ago` : null;
    const n = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / DAY));
    const date = new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
    return `last seen ${date} (${n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`})`;
  };
  ws.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** The ASIN of the product this page is about, or null. */
  ws.pageAsin = () => {
    const m = location.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (m) return m[1].toUpperCase();
    const input = document.querySelector("input#ASIN, input[name='ASIN']");
    return input && /^[A-Z0-9]{10}$/.test(input.value) ? input.value : null;
  };
  /** Build an element: h("div", { class: "x", onclick }, [children]). */
  ws.h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      // Our handlers do nothing (but ask for a refresh) once the extension is gone.
      if (k.startsWith("on")) el.addEventListener(k.slice(2), (...a) => (ws.alive() ? v(...a) : ws.staleNotice()));
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };
  /** addEventListener whose handler checks the extension is still there first. */
  ws.on = (el, type, fn, opts) => el.addEventListener(type, (...a) => (ws.alive() ? fn(...a) : ws.staleNotice()), opts);
  ws.VERDICT_COLOUR = { pass: "#15803d", warn: "#b45309", fail: "#b91c1c" };
  globalThis.__ws = ws;
})();
