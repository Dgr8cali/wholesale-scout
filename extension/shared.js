// Helpers shared by the content scripts (they run in one isolated world per page).
(() => {
  if (globalThis.__ws) return;
  const ws = {};
  ws.send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "No answer" })));
  ws.api = (method, path, body) => ws.send({ type: "api", method, path, body });
  ws.gbp = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `£${Number(n).toFixed(2)}`);
  ws.num = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-GB"));
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
