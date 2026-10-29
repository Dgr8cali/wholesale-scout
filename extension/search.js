// Search results: a small chip on each product with its verdict (Buy / Check / Skip / Not scored, the app's colours and icon) and score, from what the
// app already knows (batches of 20; nothing is screened). A grey "?" is unchecked: click to check.
(() => {
  const ws = globalThis.__ws;
  if (!/^\/s(\/|$)/.test(location.pathname)) return;
  const done = new Set();
  let queue = [];
  let timer = null;

  const items = () => [...document.querySelectorAll("div[data-component-type='s-search-result'][data-asin]")].filter((el) => /^[A-Z0-9]{10}$/.test(el.dataset.asin));

  function badge(el, b, asin) {
    el.querySelector(":scope .ws-badge")?.remove();
    const word = !b ? "?" : b.pending ? "…" : b.verdict ? ws.PRODUCT_DECISION[b.verdict]?.label ?? b.verdict : ws.NOT_SCORED;
    const node = ws.chip(ws.PRODUCT_DECISION, b?.verdict ?? null, {
      tag: "button",
      class: "ws-badge",
      text: !b || b.pending ? word : `${word}${b.score != null ? ` · ${b.score}` : ""}`,
      style: "position:absolute;top:6px;left:6px;z-index:5;cursor:pointer;min-height:24px;box-shadow:0 1px 3px rgba(0,0,0,.25)",
    });
    node.title = !b ? "Not checked by Wholesale Scout: click to check it (a check run, a few Keepa tokens)" : `Wholesale Scout: ${b.pending ? "screening" : word}${b.score != null ? `, score ${b.score}` : ""}`;
    ws.on(node, "click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b) return ws.send({ type: "settings" }).then((s) => ws.send({ type: "open", url: `${s.appUrl}/runs/${b.runId}` }));
      node.lastChild.textContent = "…";
      const r = await ws.api("GET", `/api/extension/check?asin=${asin}`);
      if (!r.ok) { node.lastChild.textContent = "!"; node.title = r.error; return; }
      const c = r.data.card;
      badge(el, { verdict: c.verdict, score: c.score == null ? null : Math.round(c.score), pending: c.pending, runId: c.runId }, asin);
    });
    const box = el.querySelector(".s-product-image-container, [data-component-type='s-product-image']") || el;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    box.append(node);
  }

  let warned = false;
  async function flush() {
    timer = null;
    while (queue.length) {
      const batch = queue.splice(0, 20);
      const r = await ws.api("GET", `/api/extension/lookup?asins=${batch.map((x) => x.asin).join(",")}`);
      if (!r.ok) {
        // No token yet, the app unreachable, or the extension reloaded: the badges just don't show
        // (said once, quietly, rather than a warning per batch in chrome://extensions → Errors).
        if (r.error !== "stale" && !warned) { warned = true; console.debug("[Wholesale Scout] search badges:", r.error); }
        return;
      }
      for (const { el, asin } of batch) badge(el, r.data.badges[asin] ?? null, asin);
    }
  }

  function scan() {
    for (const el of items()) {
      const asin = el.dataset.asin;
      if (done.has(el)) continue;
      done.add(el);
      queue.push({ el, asin });
    }
    if (queue.length && !timer) timer = setTimeout(flush, 300);
  }

  ws.send({ type: "settings" }).then((s) => {
    if (!s.configured) return;
    scan();
    // Results that load later (more pages, filters) get badges too.
    ws.observe(document.body, { childList: true, subtree: true }, () => scan());
  });
})();
