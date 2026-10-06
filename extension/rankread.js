// Rank checks, in the Amazon search tab: read the organic results (sponsored skipped) and show the
// run's progress panel with its Stop button. Injected by ranks.js; nothing here runs on its own.
(() => {
  if (globalThis.__wsRank) return;
  const isSponsored = (el) =>
    el.classList.contains("AdHolder")
    || !!el.querySelector(".puis-sponsored-label-text, .s-sponsored-label-text, .puis-sponsored-label-info-icon, a[href*='/sspa/click'], [data-component-type='sp-sponsored-result']")
    || [...el.querySelectorAll("span, a")].slice(0, 40).some((s) => s.textContent.trim() === "Sponsored");

  /** The organic results on this page, in order (each ASIN once), and where `asin` is among them. */
  function read(asin) {
    const captcha = !!document.querySelector("form[action*='validateCaptcha'], #captchacharacters");
    const items = [...document.querySelectorAll("[data-component-type='s-search-result'][data-asin]")].filter((el) => /^[A-Z0-9]{10}$/.test(el.dataset.asin || ""));
    const organic = [];
    let sponsored = 0;
    for (const el of items) {
      if (isSponsored(el)) { sponsored++; continue; }
      if (!organic.includes(el.dataset.asin)) organic.push(el.dataset.asin);
    }
    const i = organic.indexOf(asin);
    const hasNext = !!document.querySelector("a.s-pagination-next:not(.s-pagination-disabled)");
    return { captcha, organic, sponsored, index: i >= 0 ? i : null, hasNext, results: items.length };
  }

  /** The progress panel (bottom right): each term's result so far, and Stop. */
  function panel(s) {
    let el = document.getElementById("ws-rank-panel");
    if (!el) {
      el = document.createElement("div");
      el.id = "ws-rank-panel";
      el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:330px;max-height:60vh;overflow:auto;background:#fff;color:#111;border:1px solid #d4d4d8;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.18);font:13px/1.4 -apple-system,'Segoe UI',sans-serif;padding:12px";
      document.body.append(el);
    }
    const done = s.results.length;
    const rows = s.results.map((r) => `<tr><td style="padding:2px 6px 2px 0">${esc(r.keyword)}</td><td style="text-align:right;font-weight:600">${r.position == null ? "not in top 48" : `#${r.position} <span style="color:#71717a;font-weight:400">p${r.page}</span>`}</td></tr>`).join("");
    const head = s.running
      ? `Checking ${done + 1} of ${s.keywords.length}: “${esc(s.keywords[Math.min(done, s.keywords.length - 1)] || "")}”${s.status ? `<div style="color:#71717a">${esc(s.status)}</div>` : ""}`
      : s.stopped ? `Stopped after ${done} of ${s.keywords.length}.` : `Done: ${done} of ${s.keywords.length} checked.`;
    el.innerHTML = `<div style="font-weight:700;margin-bottom:4px">Wholesale Scout · rank check ${esc(s.asin)}</div>
      <div style="margin-bottom:6px">${head}</div>
      ${s.error ? `<div style="color:#b91c1c;margin-bottom:6px">${esc(s.error)}</div>` : ""}
      ${!s.running && s.saved != null ? `<div style="color:#15803d;margin-bottom:6px">Saved ${s.saved} to the app.</div>` : ""}
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="color:#71717a;font-size:11px;margin-top:6px">One search every 3–6 seconds, organic results only (sponsored skipped). Manual: runs only when you click.</div>`;
    if (s.running) {
      const b = document.createElement("button");
      b.textContent = "Stop";
      b.style.cssText = "margin-top:8px;border:1px solid #b91c1c;color:#b91c1c;background:#fff;border-radius:6px;padding:4px 12px;cursor:pointer";
      b.onclick = () => { b.disabled = true; b.textContent = "Stopping…"; try { chrome.runtime.sendMessage({ type: "rankStop" }, () => void chrome.runtime.lastError); } catch { b.textContent = "Wholesale Scout was updated — refresh this page"; } };
      el.append(b);
    }
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  globalThis.__wsRank = { read, panel };
})();
