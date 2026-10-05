// amazon.co.uk review pages (/product-reviews/<ASIN>): "Send reviews to Private label". Every review
// page you open (or that Amazon loads in place) is read and kept here, per ASIN, so a capture builds
// up as you click through pages; nothing is sent until you click. The app puts them into the Gate 4
// dump of the candidate with that ASIN (you pick when several have it, or none).
(() => {
  const ws = globalThis.__ws;
  if (!ws || globalThis.__wsReviews) return;
  globalThis.__wsReviews = true;

  const asinOf = () => location.pathname.match(/\/product-reviews\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || null;
  const KEY = (asin) => `wsReviews:${asin}`;
  let panel = null;
  let status = null; // the line under the buttons, kept until the capture changes

  const btn = (text, onclick, primary) => ws.h("button", {
    style: primary
      ? "border:0;background:#0b8ca0;color:#fff;border-radius:6px;padding:6px 10px;font-weight:600;cursor:pointer"
      : "border:1px solid #d4d4d8;background:#fff;color:#111;border-radius:6px;padding:6px 10px;cursor:pointer",
    text, onclick,
  });

  /** The reviews on the page now: stars, date, title, body, variant, helpful votes. */
  function readPage() {
    return [...document.querySelectorAll('[data-hook="review"]')].map((el) => {
      const q = (h) => el.querySelector(`[data-hook="${h}"]`);
      const starText = (q("review-star-rating") || q("cmps-review-star-rating") || el.querySelector("i[class*='a-star-']"))?.textContent || "";
      const sm = starText.match(/([1-5])(?:[.,]\d)?\s+out of 5/);
      const t = q("review-title");
      let title = "";
      if (t) {
        const spans = [...t.querySelectorAll("span")].filter((s) => !s.children.length && !s.closest(".a-icon-alt") && !s.classList.contains("a-letter-space"));
        title = spans.map((s) => s.textContent.trim()).filter(Boolean).pop() || t.textContent.replace(/[1-5](?:[.,]\d)?\s+out of 5 stars/i, "").trim();
      }
      const body = (q("review-body")?.innerText || "").replace(/\s*Read more\s*$/i, "").trim();
      const ht = (q("helpful-vote-statement")?.textContent || "").trim();
      const hm = ht.match(/([\d,]+)\s+people/i);
      const helpful = hm ? Number(hm[1].replace(/,/g, "")) : /^one person/i.test(ht) ? 1 : null;
      const variant = (q("format-strip")?.innerText || "").split(/\s*[\n|]\s*/).filter(Boolean).join(" | ") || null;
      return { id: el.id || null, stars: sm ? Number(sm[1]) : null, date: q("review-date")?.textContent.trim() || null, title: title || null, body, variant, helpful };
    }).filter((r) => r.body || r.title);
  }

  const load = async (asin) => (await chrome.storage.local.get(KEY(asin)))[KEY(asin)] || { asin, reviews: {}, pages: [], sentAt: null };
  const save = (asin, cap) => chrome.storage.local.set({ [KEY(asin)]: cap });
  const keyOf = (r) => r.id || `${r.stars}|${r.title}|${r.body.slice(0, 80)}`;

  /** Add this page's reviews to the capture for its ASIN. */
  async function capture() {
    const asin = asinOf();
    if (!asin) return;
    const found = readPage();
    const cap = await load(asin);
    let added = 0;
    for (const r of found) { const k = keyOf(r); if (!cap.reviews[k]) added++; cap.reviews[k] = r; }
    const page = Number(new URLSearchParams(location.search).get("pageNumber")) || 1;
    if (found.length && !cap.pages.includes(page)) cap.pages.push(page);
    if (added) status = null;
    await save(asin, cap);
    render(cap, found.length);
  }

  function shell() {
    if (panel && document.body.contains(panel)) return panel;
    panel = ws.h("div", { id: "wholesale-scout-reviews", style: "position:fixed;right:16px;bottom:16px;z-index:2147483000;width:340px;background:#fff;color:#111;border:2px solid #0b8ca0;border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px/1.4 -apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:8px" });
    document.body.append(panel);
    return panel;
  }

  function render(cap, onPage) {
    const list = Object.values(cap.reviews);
    const p = shell();
    const unread = list.filter((r) => r.stars == null).length;
    const stars = [1, 2, 3, 4, 5].map((s) => [s, list.filter((r) => r.stars === s).length]).filter(([, n]) => n).map(([s, n]) => `${s}★ ${n}`)
      .concat(unread ? [`stars not read ${unread}`] : []).join(" · ");
    const low = list.filter((r) => r.stars != null && r.stars <= 3).length;
    p.replaceChildren(
      ws.h("strong", { text: "Wholesale Scout · Private label" }),
      ws.h("div", { text: `${cap.asin}: ${list.length} review${list.length === 1 ? "" : "s"} captured over ${cap.pages.length} page${cap.pages.length === 1 ? "" : "s"}${onPage != null ? ` (${onPage} on this page)` : ""}.` }),
      stars ? ws.h("div", { style: "color:#52525b;font-size:12px", text: `${stars}. Gate 4 mines the ${low} at 1–3★.` }) : null,
      ws.h("div", { style: "color:#71717a;font-size:12px", text: "Click through more pages (filter to critical reviews for Gate 4) and they're added here. Nothing is sent until you click." }),
      status || ws.h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [
        list.length ? btn(cap.sentAt ? "Send again" : "Send reviews to Private label", () => send(cap), true) : null,
        list.length ? btn("Clear", async () => { await chrome.storage.local.remove(KEY(cap.asin)); status = null; capture(); }) : null,
        btn("Hide", () => { panel.remove(); panel = null; }),
      ]),
    );
  }

  const say = (cap, el) => { status = el; render(cap); };
  const err = (cap, text) => say(cap, ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [ws.h("div", { style: "color:#b91c1c", text }), btn("Back", () => { status = null; render(cap); })]));

  async function send(cap, candidateId, mode) {
    say(cap, ws.h("div", { text: "Sending…" }));
    const r = await ws.api("POST", "/api/pl/reviews/capture", { asin: cap.asin, reviews: Object.values(cap.reviews), candidateId, mode });
    if (!r.ok) return err(cap, r.error);
    const d = r.data;
    if (d.saved) {
      cap.sentAt = new Date().toISOString();
      await save(cap.asin, cap);
      const s = d.saved;
      return say(cap, ws.h("div", { style: "display:flex;flex-direction:column;gap:4px" }, [
        ws.h("div", { style: "color:#15803d", text: `Sent to “${d.candidate.name}”: ${s.added} new, ${s.total} in all for ${s.asin}; ${s.inDump} at 1–3★ in Gate 4's reviews${s.keptPaste ? " (your pasted reviews kept above them)" : ""}.` }),
        ws.h("div", { style: "display:flex;gap:8px" }, [openLink(d.candidate.id), btn("Back", () => { status = null; render(cap); })]),
      ]));
    }
    if (d.conflict) {
      return say(cap, ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
        ws.h("div", { text: `“${d.candidate.name}” already has reviews you pasted for ${cap.asin} (${ws.num(d.conflict.pastedChars)} characters).` }),
        ws.h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" }, [
          btn("Add to them", () => send(cap, d.candidate.id, "append"), true),
          btn("Replace them", () => send(cap, d.candidate.id, "replace")),
          btn("Cancel", () => { status = null; render(cap); }),
        ]),
      ]));
    }
    if (!d.pick?.length) return err(cap, "There's no candidate to send them to. Add one on the Private label page (with this ASIN among its page-one ASINs), then send again.");
    const select = ws.h("select", { style: "flex:1;min-width:0;padding:5px;border:1px solid #d4d4d8;border-radius:6px" },
      d.pick.map((c) => ws.h("option", { value: c.id, text: c.niche_keyword ? `${c.name} (${c.niche_keyword})` : c.name })));
    say(cap, ws.h("div", { style: "display:flex;flex-direction:column;gap:6px" }, [
      ws.h("div", { text: d.hasAsin ? `${d.pick.length} candidates have ${cap.asin}. Send to:` : `No candidate has ${cap.asin} among its page-one ASINs. Send to:` }),
      ws.h("div", { style: "display:flex;gap:6px" }, [select, btn("Send", () => send(cap, select.value), true)]),
      btn("Cancel", () => { status = null; render(cap); }),
    ]));
  }

  function openLink(candidateId) {
    const link = ws.h("a", { href: "#", style: "color:#0b8ca0;font-weight:600;align-self:center", text: "Open in the app" });
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const s = await ws.send({ type: "settings" });
      ws.send({ type: "open", url: `${s.appUrl}/pl/candidates?c=${candidateId}` });
    });
    return link;
  }

  // Amazon loads the next page of reviews in place: read again when the list changes.
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(capture, 700); };
  new MutationObserver((ms) => { if (ms.some((m) => !panel || !panel.contains(m.target))) later(); }).observe(document.body, { childList: true, subtree: true });
  capture();
})();
