// Opportunity Explorer panel. poe-page.js (page world) passes on the niche data Seller Central's
// page received; this keeps the latest in memory and, only once a niche has been captured, shows
// "Send to Gatekeeper". Nothing is sent until you click it, nothing is scheduled, and the page is
// never read or clicked: closing the tab forgets the capture.
(() => {
  const ws = globalThis.__ws;
  if (!ws || globalThis.__wsPoePanel) return;
  globalThis.__wsPoePanel = true;

  let niche = null; // { data, variables, at }
  let growth = null;
  let sent = null; // the niche payload last sent, so the button says so
  let panel = null;
  let shown = null; // the status line under the capture, kept until a new niche arrives

  /** The niche's title and id, as best they can be read here (the app reads them properly). */
  function describe() {
    const v = niche?.variables || {};
    let title = null, id = v.nicheId || v.id || null;
    const walk = (x, depth) => {
      if (!x || typeof x !== "object" || depth > 8 || (title && id)) return;
      for (const [k, val] of Object.entries(x)) {
        if (!title && typeof val === "string" && /^nicheTitle$|^(niche)?(display)?(title|name)$/i.test(k) && val.trim()) title = val.trim();
        else if (!id && typeof val === "string" && /^nicheId$/i.test(k)) id = val;
        else if (val && typeof val === "object") walk(val, depth + 1);
      }
    };
    walk(niche?.data, 0);
    if (!id) id = new URLSearchParams(location.search).get("nicheId") || (location.pathname.match(/niche\/([^/?#]+)/) || [])[1] || null;
    return { title, id };
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.source !== "wholesale-scout-poe") return;
    if (m.kind === "niche") { niche = { data: m.data, variables: m.variables, at: Date.now() }; shown = null; }
    else if (m.kind === "growth") growth = m.data;
    render();
  });

  const btn = (text, onclick, primary) => ws.h("button", {
    style: primary ? "background:#0b8ca0;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:600"
      : "border:1px solid #d4d4d8;background:#fff;color:#111;border-radius:6px;padding:6px 10px;cursor:pointer",
    text, onclick,
  });

  function shell() {
    if (panel && document.body.contains(panel)) return panel;
    panel = ws.h("div", { id: "wholesale-scout-poe", style: "position:fixed;right:16px;bottom:16px;z-index:2147483000;width:320px;background:#fff;color:#111;border:2px solid #0b8ca0;border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px/1.4 -apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:8px" });
    document.body.append(panel);
    return panel;
  }

  function render(status) {
    if (!niche) return; // nothing captured: no panel at all
    if (status !== undefined) shown = status;
    status = shown;
    const { title } = describe();
    const p = shell();
    const isSent = sent === niche.data;
    p.replaceChildren(
      ws.h("strong", { text: "Wholesale Scout · Gatekeeper" }),
      ws.h("div", { text: `Niche captured: ${title || "untitled niche"}${growth ? " (with growth)" : ""}` }),
      ws.h("div", { style: "color:#71717a;font-size:12px", text: "Kept in this tab only. Nothing is sent until you click." }),
      status || ws.h("div", { style: "display:flex;gap:8px" }, [
        btn(isSent ? "Send again" : "Send to Gatekeeper", send, true),
        btn("Dismiss", () => { panel.remove(); panel = null; }),
      ]),
    );
  }

  async function send() {
    const { title, id } = describe();
    render(ws.h("div", { text: "Sending…" }));
    const payload = niche.data;
    const r = await ws.api("POST", "/api/pl/poe", { nicheId: id, title, raw: { niche: payload, growth } });
    if (!r.ok) return render(ws.h("div", { style: "color:#b91c1c", text: r.error }));
    sent = payload;
    const d = r.data;
    if (d.attached) return render(done(d.attached.id, `Attached to “${d.attached.name}”: ${d.attached.filled.length} field${d.attached.filled.length === 1 ? "" : "s"} filled.`));
    if (!d.candidates.length) return render(ws.h("div", { text: "Saved, but there's no candidate to attach it to. Add one on the Private label page, then send again." }));
    const select = ws.h("select", { style: "flex:1;min-width:0;padding:5px;border:1px solid #d4d4d8;border-radius:6px" },
      d.candidates.map((c) => ws.h("option", { value: c.id, text: c.niche_keyword ? `${c.name} (${c.niche_keyword})` : c.name })));
    render(ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
      ws.h("div", { text: `No candidate's niche keyword is “${title || "this niche"}”. Attach it to:` }),
      ws.h("div", { style: "display:flex;gap:6px" }, [select, btn("Attach", async () => {
        const a = await ws.api("POST", "/api/pl/poe/attach", { snapshotId: d.snapshotId, candidateId: select.value });
        if (!a.ok) return render(ws.h("div", { style: "color:#b91c1c", text: a.error }));
        render(done(select.value, `Attached: ${a.data.filled.length} field${a.data.filled.length === 1 ? "" : "s"} filled.`));
      }, true)]),
    ]));
  }

  function done(candidateId, text) {
    const link = ws.h("a", { href: "#", style: "color:#0b8ca0;font-weight:600", text: "Open in the app" });
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const s = await ws.send({ type: "settings" });
      ws.send({ type: "open", url: `${s.appUrl}/private-label?c=${candidateId}` });
    });
    return ws.h("div", { style: "display:flex;flex-direction:column;gap:4px" }, [ws.h("div", { style: "color:#15803d", text }), link]);
  }
})();
