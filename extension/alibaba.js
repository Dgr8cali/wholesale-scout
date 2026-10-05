// Alibaba search results: "Send suppliers to Private label" (Supplier Scout). Reads the product cards
// on the page you're looking at (alibaba-parse.js) and, only when you click, sends them to the app as
// the chosen candidate's supplier leads. Sending each results page in turn adds to the same list:
// a listing already sent is updated, keeping its status and notes. Nothing is fetched from Alibaba.
(() => {
  const ws = globalThis.__ws, A = globalThis.__wsAlibaba;
  if (!ws || !A || globalThis.__wsAlibabaPanel) return;
  globalThis.__wsAlibabaPanel = true;

  const KEY = "wsAlibabaCandidate";
  let panel = null;
  let status = null;
  let seen = 0;

  const btn = (text, onclick, primary) => ws.h("button", {
    style: primary
      ? "border:0;background:#0b8ca0;color:#fff;border-radius:6px;padding:6px 10px;font-weight:600;cursor:pointer"
      : "border:1px solid #d4d4d8;background:#fff;color:#111;border-radius:6px;padding:6px 10px;cursor:pointer",
    text, onclick,
  });
  const read = () => A.parseAlibabaResults(document, location.href);
  const remembered = async () => (await chrome.storage.local.get(KEY))[KEY] || null;

  function shell() {
    if (panel && document.body.contains(panel)) return panel;
    panel = ws.h("div", { id: "wholesale-scout-alibaba", style: "position:fixed;right:16px;bottom:16px;z-index:2147483000;width:340px;background:#fff;color:#111;border:2px solid #0b8ca0;border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px/1.4 -apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:8px" });
    document.body.append(panel);
    return panel;
  }

  async function render() {
    const r = read();
    seen = r.cards.length;
    if (!seen && !r.unparsed.length) { if (panel) { panel.remove(); panel = null; } return; }
    const cand = await remembered();
    const p = shell();
    p.replaceChildren(
      ws.h("strong", { text: "Wholesale Scout · Supplier Scout" }),
      ws.h("div", { text: `${seen} supplier listing${seen === 1 ? "" : "s"} on this page${r.tradeAssurance ? " (Trade Assurance filter on)" : ""}.` }),
      r.unparsed.length ? ws.h("div", { style: "color:#b45309;font-size:12px", text: `${r.unparsed.length} card${r.unparsed.length === 1 ? "" : "s"} couldn't be read (logged in the console).` }) : null,
      ws.h("div", { style: "color:#71717a;font-size:12px", text: "Send each results page you want: they add up on the candidate. Nothing is sent until you click." }),
      status || ws.h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" }, [
        seen ? btn(cand ? `Send suppliers to “${cand.name}”` : "Send suppliers to Private label", () => send(cand ? cand.id : null), true) : null,
        cand ? btn("Change candidate", () => send(null)) : null,
        btn("Hide", () => { panel.remove(); panel = null; }),
      ]),
    );
  }

  const say = (el) => { status = el; render(); };
  const back = () => btn("Back", () => { status = null; render(); });

  async function send(candidateId) {
    const r = read();
    if (!r.cards.length) return say(ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [ws.h("div", { style: "color:#b91c1c", text: "No supplier cards on this page." }), back()]));
    say(ws.h("div", { text: "Sending…" }));
    const res = await ws.api("POST", "/api/pl/suppliers/capture", { candidateId, cards: r.cards, unparsed: r.unparsed });
    if (!res.ok) return say(ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [ws.h("div", { style: "color:#b91c1c", text: res.error }), back()]));
    const d = res.data;
    if (d.saved) {
      await chrome.storage.local.set({ [KEY]: { id: d.candidate.id, name: d.candidate.name } });
      const s = d.saved;
      return say(ws.h("div", { style: "display:flex;flex-direction:column;gap:4px" }, [
        ws.h("div", { style: "color:#15803d", text: `Sent to “${d.candidate.name}”: ${s.added} new, ${s.updated} updated; ${s.total} suppliers in all.` }),
        ws.h("div", { style: "display:flex;gap:8px" }, [openLink(d.candidate.id), back()]),
      ]));
    }
    if (!d.pick?.length) return say(ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [ws.h("div", { text: "There's no candidate to send them to. Add one on the Private label page, then send again." }), back()]));
    const select = ws.h("select", { style: "flex:1;min-width:0;padding:5px;border:1px solid #d4d4d8;border-radius:6px" },
      d.pick.map((c) => ws.h("option", { value: c.id, text: c.niche_keyword ? `${c.name} (${c.niche_keyword})` : c.name })));
    say(ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
      ws.h("div", { text: "Which candidate are these suppliers for?" }),
      ws.h("div", { style: "display:flex;gap:6px" }, [select, btn("Send", () => send(select.value), true)]),
      back(),
    ]));
  }

  function openLink(candidateId) {
    const link = ws.h("a", { href: "#", style: "color:#0b8ca0;font-weight:600;align-self:center", text: "Open in the app" });
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const s = await ws.send({ type: "settings" });
      ws.send({ type: "open", url: `${s.appUrl}/pl/candidates?c=${candidateId}#suppliers` });
    });
    return link;
  }

  // Results load in place (next page, filters): count again when the page changes.
  let timer = null;
  new MutationObserver((ms) => {
    if (ms.every((m) => panel && panel.contains(m.target))) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (read().cards.length !== seen) { status = null; render(); } }, 800);
  }).observe(document.body, { childList: true, subtree: true });
  render();
})();
