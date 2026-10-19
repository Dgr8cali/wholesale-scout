// Rank checks, in the Amazon search tab: read the organic results (sponsored skipped) and show the
// run's progress panel with its Stop button. Injected by ranks.js; nothing here runs on its own.
(() => {
  if (globalThis.__wsRank) return;
  // The mark (the app's public/logo.svg); this script runs without shared.js.
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="16" height="16"><rect width="64" height="64" rx="14" fill="#2F7F8C"/><circle cx="27" cy="27" r="15" fill="none" stroke="#fff" stroke-width="5"/><line x1="38" y1="38" x2="51" y2="51" stroke="#fff" stroke-width="6" stroke-linecap="round"/><rect x="19" y="28" width="4" height="7" rx="1" fill="#F2B544"/><rect x="25" y="24" width="4" height="11" rx="1" fill="#F2B544"/><rect x="31" y="19" width="4" height="16" rx="1" fill="#F2B544"/></svg>';
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
      el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:330px;max-height:60vh;overflow:auto;background:#fff;color:#16242A;border:1px solid #C9D2D4;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.18);font:13px/1.4 'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;padding:12px";
      document.body.append(el);
    }
    const done = s.results.length;
    const rows = s.results.map((r) => `<tr><td style="padding:2px 6px 2px 0">${esc(r.keyword)}</td><td style="text-align:right;font-weight:600">${r.position == null ? "not in top 48" : `#${r.position} <span style="color:#5A6B70;font-weight:400">p${r.page}</span>`}</td></tr>`).join("");
    const head = s.running
      ? `Checking ${done + 1} of ${s.keywords.length}: “${esc(s.keywords[Math.min(done, s.keywords.length - 1)] || "")}”${s.status ? `<div style="color:#5A6B70">${esc(s.status)}</div>` : ""}`
      : s.stopped ? `Stopped after ${done} of ${s.keywords.length}.` : `Done: ${done} of ${s.keywords.length} checked.`;
    el.innerHTML = `<div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="display:inline-flex;width:16px;height:16px">${LOGO}</span>Wholesale Scout · rank check ${esc(s.asin)}</div>
      <div style="margin-bottom:6px">${head}</div>
      ${s.error ? `<div style="color:#B42318;margin-bottom:6px">${esc(s.error)}</div>` : ""}
      ${!s.running && s.saved != null ? `<div style="color:#1F7A4D;margin-bottom:6px">Saved ${s.saved} to the app.</div>` : ""}
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="color:#5A6B70;font-size:11px;margin-top:6px">One search every 3–6 seconds, organic results only (sponsored skipped). Manual: runs only when you click.</div>`;
    if (s.running) {
      const b = document.createElement("button");
      b.textContent = "Stop";
      b.style.cssText = "margin-top:8px;border:1px solid #B42318;color:#B42318;background:#fff;border-radius:6px;padding:4px 12px;cursor:pointer";
      b.onclick = () => { b.disabled = true; b.textContent = "Stopping…"; try { chrome.runtime.sendMessage({ type: "rankStop" }, () => void chrome.runtime.lastError); } catch { b.textContent = "Wholesale Scout was updated — refresh this page"; } };
      el.append(b);
    }
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  globalThis.__wsRank = { read, panel };
})();
