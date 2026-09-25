// Seller Central: after "Look up" in the product panel, read the dangerous-goods classification on
// the page that opened and, once you confirm it, save it to the app's product record. Seller
// Central's pages change and can't be read reliably, so the reading is a suggestion you confirm.
(() => {
  const ws = globalThis.__ws;
  const FRESH_MS = 15 * 60_000;

  chrome.storage.local.get({ pendingDg: null }, ({ pendingDg }) => {
    if (!pendingDg || Date.now() - pendingDg.at > FRESH_MS) return;
    const asin = pendingDg.asin;
    let status = "unknown";
    let detail = "";

    const bar = ws.h("div", { id: "wholesale-scout-dg", style: "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;background:#fff;color:#111;border:2px solid #0f766e;border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px/1.4 -apple-system,Segoe UI,sans-serif;display:flex;flex-wrap:wrap;gap:8px;align-items:center" });
    document.body.append(bar);

    /** What the page says, as a suggestion: "not dangerous goods" beats a mention of dangerous goods. */
    function read() {
      // The page's own text, not this bar's.
      const text = [...document.body.children].filter((n) => n !== bar).map((n) => n.innerText || "").join(" ").replace(/\s+/g, " ");
      const before = `${status}|${detail}`;
      if (!text.includes(asin) && !/dangerous goods|hazmat/i.test(text)) return;
      const neg = text.match(/.{0,60}(not (?:a |classified as )?dangerous goods|non[- ]dangerous goods|not hazmat|non[- ]hazmat).{0,60}/i);
      const pos = text.match(/.{0,60}(dangerous goods|hazmat|class \d(?:\.\d)? |UN\d{4}).{0,80}/i);
      if (neg) { status = "not_hazmat"; detail = neg[0].trim(); }
      else if (pos) { status = "hazmat"; detail = pos[0].trim(); }
      if (`${status}|${detail}` !== before) render();
    }

    function render() {
      const choice = (value, label) => ws.h("label", { style: "display:flex;gap:4px;align-items:center" }, [
        ws.h("input", { type: "radio", name: "ws-dg", value, checked: status === value, onchange: () => { status = value; } }), label,
      ]);
      bar.replaceChildren(
        ws.h("strong", { text: `Wholesale Scout · DG for ${asin}:` }),
        choice("hazmat", "Hazmat"), choice("not_hazmat", "Not hazmat"), choice("unknown", "Unknown"),
        ws.h("span", { style: "color:#71717a;flex:1;min-width:200px;font-size:12px", text: detail ? `Read on the page: “${detail}”` : "Nothing found yet: pick what Seller Central says." }),
        ws.h("button", {
          style: "background:#0f766e;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer", text: "Save to the app",
          onclick: async () => {
            const r = await ws.api("POST", "/api/extension/dg", { asin, status, detail: detail || null, url: location.href });
            if (!r.ok) return alert(`Wholesale Scout: ${r.error}`);
            chrome.storage.local.remove("pendingDg");
            bar.replaceChildren(ws.h("span", { text: `Saved: ${asin} is ${status === "hazmat" ? "hazmat" : status === "not_hazmat" ? "not hazmat" : "unknown"} in the app.` }));
            setTimeout(() => bar.remove(), 4000);
          },
        }),
        ws.h("button", { style: "border:1px solid #d4d4d8;background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer", text: "Dismiss", onclick: () => { chrome.storage.local.remove("pendingDg"); bar.remove(); } }),
      );
    }

    render();
    read();
    // Seller Central fills its pages in after load: read again as it does.
    let t = null;
    new MutationObserver((changes) => {
      if (changes.every((c) => bar.contains(c.target))) return; // our own redraw
      clearTimeout(t);
      t = setTimeout(read, 700);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
