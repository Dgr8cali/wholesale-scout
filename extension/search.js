// Search results: a small badge on each product with its verdict colour and score, from what the
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
    const colour = b?.verdict ? ws.VERDICT_COLOUR[b.verdict] : "#71717a";
    const label = !b ? "?" : b.pending ? "…" : `${b.verdict ?? "—"}${b.score != null ? ` ${b.score}` : ""}`;
    const node = ws.h("button", {
      class: "ws-badge",
      title: !b ? "Not checked by Wholesale Scout: click to check it (a check run, a few Keepa tokens)" : `Wholesale Scout: ${b.verdict ?? "screening"}${b.score != null ? `, score ${b.score}` : ""}`,
      style: `position:absolute;top:6px;left:6px;z-index:5;border:0;border-radius:999px;padding:2px 8px;font:700 11px/1.4 sans-serif;color:#fff;background:${colour};cursor:pointer;text-transform:uppercase;box-shadow:0 1px 3px rgba(0,0,0,.25)`,
      text: label,
      onclick: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (b) return ws.send({ type: "settings" }).then((s) => ws.send({ type: "open", url: `${s.appUrl}/runs/${b.runId}` }));
        node.textContent = "…";
        const r = await ws.api("GET", `/api/extension/check?asin=${asin}`);
        if (!r.ok) { node.textContent = "!"; node.title = r.error; return; }
        const c = r.data.card;
        badge(el, { verdict: c.verdict, score: c.score == null ? null : Math.round(c.score), pending: c.pending, runId: c.runId }, asin);
      },
    });
    const box = el.querySelector(".s-product-image-container, [data-component-type='s-product-image']") || el;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    box.append(node);
  }

  async function flush() {
    timer = null;
    while (queue.length) {
      const batch = queue.splice(0, 20);
      const r = await ws.api("GET", `/api/extension/lookup?asins=${batch.map((x) => x.asin).join(",")}`);
      if (!r.ok) {
        console.warn("[Wholesale Scout]", r.error);
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
    new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true });
  });
})();
