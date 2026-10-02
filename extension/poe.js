// Opportunity Explorer panel. poe-page.js (page world) passes on every /ox-api/graphql response the
// page receives (with its operation name) and the insights widget's. This keeps them all, in memory,
// for the niche page you're on, since the page's tabs load their data in separate calls. Once the
// niche itself (getNiche, data.niche) has arrived, it shows "Send to Private label"; the merged set is
// sent only when you click. Nothing is scheduled, and the page is never read or clicked. Moving to
// another niche or closing the tab forgets the capture.
(() => {
  const ws = globalThis.__ws;
  if (!ws || globalThis.__wsPoePanel) return;
  globalThis.__wsPoePanel = true;

  const NICHE_OP = "getNiche";
  const FIELDS = 8; // what the app reads: title, volume, growth, products, click share, conversion, units, search terms

  let page = null; // the niche page the capture belongs to
  let ops = new Map(); // operation name → { data, variables, count }
  let growth = [];
  let sent = null; // the getNiche payload last sent, so the button says "Send again"
  let panel = null;
  let shown; // the status line under the capture, kept until a new niche arrives

  const nicheObj = () => ops.get(NICHE_OP)?.data?.data?.niche || null;

  /** The niche's title and id, as best they can be read here (the app reads them properly). */
  function describe() {
    const n = nicheObj();
    const v = ops.get(NICHE_OP)?.variables || {};
    let title = null;
    const walk = (x, depth) => {
      if (!x || typeof x !== "object" || Array.isArray(x) || depth > 4 || title) return;
      for (const [k, val] of Object.entries(x)) {
        if (!title && typeof val === "string" && /^nicheTitle$|^(niche)?(display)?(title|name)$/i.test(k) && val.trim()) title = val.trim();
        else if (val && typeof val === "object" && !Array.isArray(val)) walk(val, depth + 1);
      }
    };
    walk(n, 0);
    const id = (n && n.nicheId) || v.nicheId || new URLSearchParams(location.search).get("nicheId") || (location.pathname.match(/niche\/([^/?#]+)/) || [])[1] || null;
    return { title, id };
  }

  /** A new niche page (address or niche id changed): start again. */
  function startPage(key) {
    page = key;
    ops = new Map();
    growth = [];
    shown = undefined;
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.source !== "wholesale-scout-poe") return;
    const here = location.pathname + location.search;
    if (page !== here) startPage(here);
    if (m.kind === "graphql") {
      const name = m.op || "(unnamed)";
      // A getNiche for a different niche than the one held: a new capture.
      const newId = m.data?.data?.niche?.nicheId;
      if (name === NICHE_OP && newId && nicheObj()?.nicheId && newId !== nicheObj().nicheId) startPage(here);
      const cur = ops.get(name);
      // Keep getNiche's niche even if a later call of the same name came back empty.
      if (name === NICHE_OP && cur?.data?.data?.niche && !m.data?.data?.niche) { cur.count++; render(); return; }
      ops.set(name, { data: m.data, variables: m.variables, count: (cur?.count || 0) + 1 });
    } else if (m.kind === "growth") growth.push(m.data);
    render();
  });

  const btn = (text, onclick, primary) => ws.h("button", {
    style: primary ? "background:#0b8ca0;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:600"
      : "border:1px solid #d4d4d8;background:#fff;color:#111;border-radius:6px;padding:6px 10px;cursor:pointer",
    text, onclick,
  });

  function shell() {
    if (panel && document.body.contains(panel)) return panel;
    panel = ws.h("div", { id: "wholesale-scout-poe", style: "position:fixed;right:16px;bottom:16px;z-index:2147483000;width:340px;background:#fff;color:#111;border:2px solid #0b8ca0;border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px/1.4 -apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:8px" });
    document.body.append(panel);
    return panel;
  }

  /** The debug line: every operation seen on this niche page, with how many responses. */
  const debugLine = () => ws.h("div", { style: "color:#71717a;font:11px/1.3 ui-monospace,Menlo,monospace;word-break:break-word", text:
    `Seen: ${[...ops].map(([n, o]) => `${n}${o.count > 1 ? ` ×${o.count}` : ""}`).join(", ") || "nothing yet"}${growth.length ? `; insights ×${growth.length}` : ""}` });

  function render(status) {
    if (!ops.size && !growth.length) return; // nothing seen: no panel at all
    if (status !== undefined) shown = status;
    const niche = nicheObj();
    const p = shell();
    const { title } = describe();
    const isSent = niche && sent === niche;
    p.replaceChildren(
      ws.h("strong", { text: "Wholesale Scout · Private label" }),
      niche
        ? ws.h("div", { text: `Niche captured: ${title || "title not found (sent anyway)"}` })
        : ws.h("div", { style: "color:#b45309", text: "No niche data yet. Open a niche; its page loads it (getNiche)." }),
      debugLine(),
      ws.h("div", { style: "color:#71717a;font-size:12px", text: "Kept in this tab only. Nothing is sent until you click." }),
      shown || ws.h("div", { style: "display:flex;gap:8px" }, [
        niche ? btn(isSent ? "Send again" : "Send to Private label", send, true) : null,
        btn("Dismiss", () => { panel.remove(); panel = null; }),
      ]),
    );
  }

  /** What the app read, said plainly: nothing read is never shown as a success. */
  function outcome(prefix, filled, unread, candidateId) {
    if (unread.length >= FIELDS) {
      return ws.h("div", { style: "color:#b45309", text: `${prefix}captured but could not read ${unread.length} fields — raw saved. Nothing was filled.` });
    }
    const lines = [ws.h("div", { style: "color:#15803d", text: `${prefix}${filled.length} field${filled.length === 1 ? "" : "s"} filled.` })];
    if (unread.length) lines.push(ws.h("div", { style: "color:#b45309", text: `Could not read ${unread.length} of ${FIELDS}: ${unread.join(", ")} (raw saved).` }));
    if (candidateId) lines.push(openLink(candidateId));
    return ws.h("div", { style: "display:flex;flex-direction:column;gap:4px" }, lines);
  }

  async function send() {
    const { title, id } = describe();
    const niche = nicheObj();
    render(ws.h("div", { text: "Sending…" }));
    const raw = {
      niche: ops.get(NICHE_OP)?.data || null,
      operations: Object.fromEntries([...ops].map(([n, o]) => [n, o.data])),
      growth,
      seen: [...ops.keys()],
    };
    const r = await ws.api("POST", "/api/pl/poe", { nicheId: id, title, raw });
    if (!r.ok) return render(ws.h("div", { style: "color:#b91c1c", text: r.error }));
    sent = niche;
    const d = r.data;
    const unread = d.unread || [];
    if (d.attached) return render(outcome(`Attached to “${d.attached.name}”: `, d.attached.filled, unread, d.attached.id));
    if (!d.candidates.length) return render(ws.h("div", { text: "Saved, but there's no candidate to attach it to. Add one on the Private label page, then send again." }));
    const select = ws.h("select", { style: "flex:1;min-width:0;padding:5px;border:1px solid #d4d4d8;border-radius:6px" },
      d.candidates.map((c) => ws.h("option", { value: c.id, text: c.niche_keyword ? `${c.name} (${c.niche_keyword})` : c.name })));
    render(ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
      ws.h("div", { text: `No candidate's niche keyword is “${title || "this niche"}”. Attach it to:` }),
      unread.length >= FIELDS ? ws.h("div", { style: "color:#b45309", text: `Warning: the app could not read any of the ${FIELDS} fields from this capture.` }) : null,
      ws.h("div", { style: "display:flex;gap:6px" }, [select, btn("Attach", async () => {
        const a = await ws.api("POST", "/api/pl/poe/attach", { snapshotId: d.snapshotId, candidateId: select.value });
        if (!a.ok) return render(ws.h("div", { style: "color:#b91c1c", text: a.error }));
        render(outcome("Attached: ", a.data.filled || [], a.data.unread || [], select.value));
      }, true)]),
    ]));
  }

  function openLink(candidateId) {
    const link = ws.h("a", { href: "#", style: "color:#0b8ca0;font-weight:600", text: "Open in the app" });
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const s = await ws.send({ type: "settings" });
      ws.send({ type: "open", url: `${s.appUrl}/pl/candidates?c=${candidateId}` });
    });
    return link;
  }
})();
