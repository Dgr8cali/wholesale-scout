// Product pages: a collapsible panel on the right with Wholesale Scout's verdict card, a cost box,
// star / watch / open, competitor stock (on request) and a Seller Central DG look-up.
(() => {
  const ws = globalThis.__ws;
  const asin = ws.pageAsin();
  if (!asin || document.getElementById("wholesale-scout-panel")) return;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .wrap { position: fixed; top: 120px; right: 0; z-index: 2147483000; display: flex; align-items: flex-start; }
    .tab { writing-mode: vertical-rl; background: #0f766e; color: #fff; border: 0; border-radius: 8px 0 0 8px; padding: 10px 6px; font: 600 12px/1 sans-serif; cursor: pointer; }
    .panel { width: 320px; max-height: calc(100vh - 140px); overflow: auto; background: #fff; color: #111; border: 1px solid #d4d4d8; border-right: 0;
      border-radius: 10px 0 0 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 12px; font-size: 13px; line-height: 1.35; }
    .hidden { display: none; }
    .row { display: flex; align-items: center; gap: 8px; }
    .between { justify-content: space-between; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; color: #fff; text-transform: uppercase; }
    .muted { color: #71717a; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin: 10px 0; }
    .k { color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
    .v { font-weight: 600; font-variant-numeric: tabular-nums; }
    .why { font-size: 12px; color: #3f3f46; margin: 6px 0 8px; }
    input { width: 100%; padding: 6px 8px; border: 1px solid #d4d4d8; border-radius: 6px; font-size: 13px; }
    button.b { border: 1px solid #d4d4d8; background: #fff; border-radius: 6px; padding: 6px 8px; font-size: 12px; cursor: pointer; }
    button.b:hover { background: #f4f4f5; }
    button.p { background: #0f766e; border-color: #0f766e; color: #fff; }
    button:disabled { opacity: .5; cursor: default; }
    a { color: #0f766e; }
    .sec { border-top: 1px solid #e4e4e7; margin-top: 10px; padding-top: 8px; }
    .err { color: #b91c1c; font-size: 12px; }
    ul { margin: 4px 0 0; padding-left: 16px; }
  `;

  const host = ws.h("div", { id: "wholesale-scout-panel" });
  const root = host.attachShadow({ mode: "open" });
  root.append(ws.h("style", { text: CSS }));
  const panel = ws.h("div", { class: "panel" });
  const tab = ws.h("button", { class: "tab", title: "Wholesale Scout", text: "Wholesale Scout", onclick: () => toggle() });
  root.append(ws.h("div", { class: "wrap" }, [tab, panel]));
  document.documentElement.append(host);

  let open = true;
  chrome.storage.local.get({ panelOpen: true }, (s) => { open = s.panelOpen; panel.classList.toggle("hidden", !open); });
  const toggle = () => {
    open = !open;
    panel.classList.toggle("hidden", !open);
    chrome.storage.local.set({ panelOpen: open });
  };

  let settings = { appUrl: "", configured: false };
  let card = null;
  let cost = "";
  let pollTimer = null;
  let message = null;
  let stockRows = null;

  const status = (text, isError) => { message = text ? { text, isError } : null; render(); };

  async function load(fresh) {
    clearTimeout(pollTimer);
    status("Checking…");
    const q = new URLSearchParams({ asin });
    if (cost) q.set("cost", cost);
    if (fresh) q.set("fresh", "1");
    const r = await ws.api("GET", `/api/extension/check?${q}`);
    if (!r.ok) return status(r.error, true);
    card = r.data.card;
    message = null;
    render();
    if (card?.pending) poll(0);
  }

  // While Keepa and gating are still to come, check back every 5 s (for up to 3 minutes).
  function poll(n) {
    if (n > 36 || !card?.runId) return;
    pollTimer = setTimeout(async () => {
      const r = await ws.api("GET", `/api/extension/check?run=${card.runId}`);
      if (r.ok) { card = r.data.card; render(); }
      if (card?.pending) poll(n + 1);
    }, 5000);
  }

  const kv = (k, v) => ws.h("div", {}, [ws.h("div", { class: "k", text: k }), ws.h("div", { class: "v" }, [v])]);

  function render() {
    panel.replaceChildren();
    const top = ws.h("div", { class: "row between" }, [
      ws.h("strong", { text: "Wholesale Scout" }),
      ws.h("button", { class: "b", title: "Collapse", text: "×", onclick: toggle }),
    ]);
    panel.append(top);
    if (!settings.configured) {
      panel.append(ws.h("p", { class: "err", text: "Open the extension's popup (its toolbar icon) and set the app URL and password." }));
      return;
    }
    if (!card && !message) {
      panel.append(ws.h("p", { class: "muted", text: "Not checked yet. A new ASIN is a check run in the app (a few Keepa tokens)." }));
      panel.append(ws.h("button", { class: "b p", text: `Check ${asin}`, onclick: () => load(false) }));
      return;
    }
    if (card) {
      const c = card;
      const colour = c.verdict ? ws.VERDICT_COLOUR[c.verdict] : "#71717a";
      panel.append(ws.h("div", { class: "row", style: "margin-top:8px" }, [
        ws.h("span", { class: "badge", style: `background:${colour}`, text: c.verdict ?? (c.pending ? "screening" : "—") }),
        c.score != null ? ws.h("span", { class: "v", text: `Score ${Math.round(c.score)}` }) : null,
        c.pending ? ws.h("span", { class: "muted", text: "pending: Keepa and gating still coming" }) : null,
      ]));
      if (c.title) panel.append(ws.h("div", { class: "muted", style: "margin-top:4px", text: c.title }));
      const amazon = !c.amazon ? "—" : c.amazon.sellingNow ? "selling now" : c.amazon.lastSeenDays != null ? `last seen ${c.amazon.lastSeenDays} days ago` : c.keepaHistory ? "never" : "not now";
      const gating = c.gating ? ({ open: "Open", approval_required: "Approval needed", blocked: "Blocked" }[c.gating.status] ?? c.gating.status) : "—";
      panel.append(ws.h("div", { class: "grid" }, [
        kv("Buy Box", ws.gbp(c.buyBox)),
        kv("Sales / mo", ws.num(c.salesPerMonth)),
        kv("Sellers", ws.num(c.sellers)),
        kv("Your share / mo", ws.num(c.yourSharePerMonth)),
        kv("Amazon", amazon),
        kv("Gating", c.gating?.applyUrl ? ws.h("span", {}, [gating, " · ", ws.h("a", { href: c.gating.applyUrl, target: "_blank", rel: "noreferrer", text: "Apply" })]) : gating),
        kv(c.hurdle.kind === "landed" ? "Max landed" : "Hurdle (sell at)", ws.gbp(c.hurdle.value)),
        kv(c.costKnown ? `Profit at ${ws.gbp(c.landed)}` : "Profit", c.costKnown ? ws.gbp(c.profit) : "needs a cost"),
      ]));
      if (c.why) panel.append(ws.h("div", { class: "why", text: c.why }));
    }
    const costInput = ws.h("input", { placeholder: "Your landed cost, £ (optional)", inputmode: "decimal", value: cost });
    let t = null;
    costInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = costInput.value.trim().replace(",", ".");
        if (v && !(Number(v) > 0)) return status("That isn't a cost.", true);
        cost = v;
        load(false);
      }, 800);
    });
    panel.append(costInput);
    panel.append(ws.h("div", { class: "row", style: "margin-top:8px;flex-wrap:wrap" }, [
      ws.h("button", { class: "b", text: "☆ Star", disabled: !card, onclick: () => act("POST", "/api/extension/star", "Starred") }),
      ws.h("button", { class: "b", text: "Watch", title: "Add to the watchlist with the condition suggested from what blocked it", disabled: !card, onclick: () => act("POST", "/api/extension/watch", "On the watchlist") }),
      ws.h("button", { class: "b", text: "Open in app", disabled: !card, onclick: () => ws.send({ type: "open", url: `${settings.appUrl}${card.runUrl}` }) }),
      ws.h("button", { class: "b", text: "Re-check", title: "Screen again now instead of reusing today's check", onclick: () => load(true) }),
    ]));
    if (message) panel.append(ws.h("p", { class: message.isError ? "err" : "muted", text: message.text }));

    // Competitor stock and the DG look-up: only when you ask.
    const sec = ws.h("div", { class: "sec" }, [
      ws.h("div", { class: "row between" }, [
        ws.h("strong", { style: "font-size:12px", text: "FBA competitors' stock" }),
        ws.h("button", { class: "b", text: stockRows ? "Read again" : "Read stock", disabled: stockBusy, onclick: readStock }),
      ]),
      ws.h("div", { class: "muted", text: "Adds 999 of each FBA seller's offer to your Amazon cart, one at a time, reads what Amazon allows, then removes it. Amazon's terms prohibit automated data gathering; use sparingly." }),
    ]);
    if (stockRows) {
      sec.append(ws.h("ul", {}, stockRows.map((s) => ws.h("li", {}, [
        `${s.name ?? s.sellerId}: `,
        ws.h("b", { text: s.error ? "?" : s.stock == null ? "…" : ws.num(s.stock) }),
        s.limited ? " (per-customer limit, not stock)" : "",
        s.error ? ws.h("span", { class: "err", text: ` ${s.error}` }) : "",
      ]))));
    }
    panel.append(sec);
    panel.append(ws.h("div", { class: "sec row between" }, [
      ws.h("span", { class: "muted", text: "Dangerous goods: Seller Central's classification" }),
      ws.h("button", { class: "b", text: "Look up", onclick: () => ws.send({ type: "dgLookup", asin }) }),
    ]));
  }

  async function act(method, path, done) {
    const r = await ws.api(method, path, { asin });
    status(r.ok ? done : r.error, !r.ok);
  }

  // ——— Competitor stock (opt-in per click, one seller at a time, spaced out) ———
  let stockBusy = false;
  const GAP_MS = 4000;
  const MAX_SELLERS = 8;

  async function readStock() {
    if (stockBusy) return;
    stockBusy = true;
    stockRows = [];
    status("Reading the offers…");
    try {
      if (await cartHas(asin)) throw new Error("This product is already in your cart: remove it first so the reading is only the seller's.");
      const offers = (await fetchOffers(asin)).filter((o) => o.fba && !o.isAmazon).slice(0, MAX_SELLERS);
      if (!offers.length) throw new Error("No FBA seller offers found (or Amazon's offers panel has changed).");
      stockRows = offers.map((o) => ({ sellerId: o.sellerId, name: o.name, fba: true, stock: null, limited: false }));
      render();
      for (let i = 0; i < offers.length; i++) {
        if (i) await ws.sleep(GAP_MS);
        status(`Reading ${offers[i].name ?? offers[i].sellerId} (${i + 1} of ${offers.length})…`);
        try {
          const r = await stockOf(offers[i]);
          Object.assign(stockRows[i], r);
        } catch (e) {
          stockRows[i].error = e.message;
        }
        render();
      }
      const saved = await ws.api("POST", "/api/extension/stock", { asin, sellers: stockRows.map((s) => ({ sellerId: s.sellerId, name: s.name, fba: s.fba, stock: s.stock, limited: s.limited })) });
      status(saved.ok ? "Stock saved to the app." : saved.error, !saved.ok);
    } catch (e) {
      status(e.message, true);
    } finally {
      stockBusy = false;
      render();
    }
  }

  const parse = (html) => new DOMParser().parseFromString(html, "text/html");

  /** Every offer on Amazon's "all offers" panel: seller, FBA or not, and its add-to-cart form. */
  async function fetchOffers(a) {
    const url = `/gp/product/ajax/ref=dp_aod_ALL_mbc?asin=${a}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Amazon's offers panel answered ${res.status}`);
    const doc = parse(await res.text());
    const nodes = [...new Set(doc.querySelectorAll("#aod-pinned-offer, #aod-offer, [id^='aod-offer-']:not([id*='-heading'])"))].filter((n) => n.querySelector("form"));
    return nodes.map((n) => {
      const link = n.querySelector("a[href*='seller=']");
      const sellerId = link ? new URL(link.getAttribute("href"), location.origin).searchParams.get("seller") : null;
      const soldBy = (n.querySelector("#aod-offer-soldBy") || n).textContent.replace(/\s+/g, " ").trim();
      const shipsFrom = (n.querySelector("#aod-offer-shipsFrom") || n).textContent.replace(/\s+/g, " ");
      return {
        sellerId: sellerId || "unknown",
        name: link ? link.textContent.trim() : null,
        isAmazon: !link && /Amazon/i.test(soldBy),
        fba: /Amazon/i.test(shipsFrom),
        form: n.querySelector("form"),
      };
    }).filter((o) => o.sellerId !== "unknown" || o.isAmazon);
  }

  async function postForm(form, patch = {}) {
    const body = new URLSearchParams();
    for (const el of form.querySelectorAll("input[name]")) {
      if ((el.type === "submit" || el.type === "image") && !(el.name in patch)) continue;
      body.set(el.name, el.value);
    }
    for (const [k, v] of Object.entries(patch)) body.set(k, v);
    const action = new URL(form.getAttribute("action") || location.pathname, location.origin);
    return fetch(action, { method: "POST", body, credentials: "include" });
  }

  async function cartDoc() {
    const res = await fetch("/gp/cart/view.html?ref_=nav_cart", { credentials: "include" });
    return parse(await res.text());
  }
  async function cartHas(a) {
    return !!(await cartDoc()).querySelector(`[data-asin="${a}"]`);
  }

  /** Add 999 of one offer, read what the cart allows, then take it out again. */
  async function stockOf(offer) {
    const qtyNames = [...offer.form.querySelectorAll("input[name]")].map((i) => i.name).filter((n) => /quantity/i.test(n));
    const patch = Object.fromEntries((qtyNames.length ? qtyNames : ["quantity"]).map((n) => [n, "999"]));
    const add = await postForm(offer.form, patch);
    if (!add.ok) throw new Error(`adding to the cart failed (${add.status})`);
    const doc = await cartDoc();
    const item = doc.querySelector(`[data-asin="${asin}"]`);
    try {
      if (!item) throw new Error("not in the cart after adding (Amazon may have asked to confirm)");
      const text = item.textContent.replace(/\s+/g, " ");
      const only = text.match(/only (\d[\d,]*) (?:of these )?(?:are )?available/i);
      const limit = text.match(/limit(?:ed)? (?:of |to )?(\d[\d,]*) per customer/i);
      const field = item.getAttribute("data-quantity") || item.querySelector("input[name^='quantityBox'], input[name='quantity']")?.value
        || item.querySelector("select[name='quantity'] option[selected], [data-a-selector='value']")?.textContent;
      const n = (s) => (s == null ? null : Number(String(s).replace(/[^\d]/g, "")) || null);
      if (limit) return { stock: n(limit[1]), limited: true };
      if (only) return { stock: n(only[1]), limited: false };
      if (field != null && n(field) != null) return { stock: n(field), limited: false };
      throw new Error("the cart didn't show a quantity (Amazon may have changed its pages)");
    } finally {
      await removeFromCart(doc, asin).catch(() => {});
    }
  }

  async function removeFromCart(doc, a) {
    const item = doc.querySelector(`[data-asin="${a}"]`);
    const del = item?.querySelector("input[value='Delete'], input[name^='submit.delete']");
    const form = del?.closest("form") || doc.querySelector("#activeCartViewForm");
    if (!del || !form) return;
    await postForm(form, { [del.name]: del.value || "Delete" });
  }

  ws.send({ type: "settings" }).then((s) => {
    settings = s;
    render();
    if (s.configured && s.autoCheck) load(false);
  });
})();
