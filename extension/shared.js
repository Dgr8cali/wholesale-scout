// Helpers shared by the content scripts (they run in one isolated world per page).
(() => {
  if (globalThis.__ws) return;
  const ws = {};
  ws.send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "No answer" })));
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
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };
  ws.VERDICT_COLOUR = { pass: "#15803d", warn: "#b45309", fail: "#b91c1c" };
  globalThis.__ws = ws;
})();
