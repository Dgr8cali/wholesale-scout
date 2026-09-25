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
    const unchecked = !card && !message;
    if (unchecked) {
      panel.append(ws.h("p", { class: "muted", text: "Not checked yet. A new ASIN is a check run in the app (a few Keepa tokens)." }));
      panel.append(ws.h("button", { class: "b p", text: `Check ${asin}`, onclick: () => load(false) }));
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
    if (!unchecked) renderCostAndActions();
    renderSections();
  }

  function renderCostAndActions() {
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
  }

  function renderSections() {
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
    if (debug.length) {
      const dump = debug.map((d) => JSON.stringify(d)).join("\n\n");
      sec.append(ws.h("details", { style: "margin-top:6px" }, [
        ws.h("summary", { class: "muted", style: "cursor:pointer", text: `Debug (${debug.length} steps)` }),
        ws.h("button", { class: "b", style: "margin:4px 0", text: "Copy", onclick: () => navigator.clipboard.writeText(dump).then(() => status("Debug copied.")) }),
        ws.h("pre", { style: "white-space:pre-wrap;word-break:break-all;font-size:10px;max-height:200px;overflow:auto;background:#f4f4f5;padding:6px;border-radius:6px", text: dump }),
      ]));
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
  // What Amazon sent back at each step (first 1,500 characters), for the collapsed Debug section.
  let debug = [];
  const note = (step, info) => { debug.push({ step, ...info }); };
  const snippet = (text) => String(text ?? "").replace(/\s+/g, " ").slice(0, 1500);

  async function readStock() {
    if (stockBusy) return;
    stockBusy = true;
    stockRows = [];
    debug = [];
    status("Reading the offers…");
    try {
      if (await cartHas(asin)) throw new Error("This product is already in your cart: remove it first so the reading is only the seller's.");
      let offers = await offersFromAod(asin).catch((e) => { note("AOD failed", { error: e.message }); return []; });
      if (!offers.length) {
        offers = offersOnPage();
        note("Fallback: offers on this page", { found: offers.length });
      }
      offers = offers.filter((o) => o.fba && !o.isAmazon && o.oid).slice(0, MAX_SELLERS);
      if (!offers.length) throw new Error("No FBA seller offers with an offer listing ID found. Open Debug below and paste it to fix the reader.");
      stockRows = offers.map((o) => ({ sellerId: o.sellerId, name: o.name, fba: true, stock: null, limited: false }));
      render();
      for (let i = 0; i < offers.length; i++) {
        if (i) await ws.sleep(GAP_MS);
        status(`Reading ${offers[i].name ?? offers[i].sellerId} (${i + 1} of ${offers.length})…`);
        try {
          Object.assign(stockRows[i], await stockOf(offers[i]));
        } catch (e) {
          stockRows[i].error = e.message;
        }
        render();
      }
      const saved = await ws.api("POST", "/api/extension/stock", { asin, sellers: stockRows.map((x) => ({ sellerId: x.sellerId, name: x.name, fba: x.fba, stock: x.stock, limited: x.limited })) });
      status(saved.ok ? "Stock saved to the app." : saved.error, !saved.ok);
    } catch (e) {
      status(e.message, true);
    } finally {
      stockBusy = false;
      render();
    }
  }

  const parse = (html) => new DOMParser().parseFromString(html, "text/html");
  const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const sellerIdFrom = (a) => {
    if (!a) return null;
    try { return new URL(a.getAttribute("href"), location.origin).searchParams.get("seller"); } catch { return null; }
  };

  /** An offer's listing ID, wherever Amazon put it in this block. */
  function offerListingId(el) {
    const input = el.querySelector("input[name*='offeringID' i], input[name*='offerListingId' i], input[name='oid']");
    if (input?.value) return input.value;
    for (const node of el.querySelectorAll("[data-aod-atc-action], [data-action='aod-atc-action']")) {
      try {
        const j = JSON.parse(node.getAttribute("data-aod-atc-action") || "{}");
        if (j.oid) return j.oid;
      } catch { /* not JSON */ }
    }
    const withOid = el.querySelector("[data-oid], [data-offer-listing-id]");
    return withOid?.getAttribute("data-oid") || withOid?.getAttribute("data-offer-listing-id") || null;
  }

  /** Amazon's all-offers (AOD) list: every offer, its seller, whether Amazon ships it, and its listing ID. */
  async function offersFromAod(a) {
    const filters = encodeURIComponent(JSON.stringify({ all: true, new: true }));
    const url = `/gp/product/ajax/ref=dp_aod_NEW_mbc?asin=${a}&pc=dp&experienceId=aodAjaxMain&filters=${filters}`;
    const res = await fetch(url, { credentials: "include", headers: { accept: "text/html,*/*" } });
    const body = await res.text();
    note("AOD", { url, status: res.status, body: snippet(body) });
    if (!res.ok) throw new Error(`Amazon's offers panel answered ${res.status}`);
    const doc = parse(body);
    const blocks = [...new Set(doc.querySelectorAll("#aod-pinned-offer, #aod-offer, div[id^='aod-offer']"))]
      .filter((b) => b.querySelector("#aod-offer-soldBy, [id*='soldBy'], #aod-offer-shipsFrom, [id*='shipsFrom']"));
    const offers = blocks.map((b) => {
      const soldBy = b.querySelector("#aod-offer-soldBy, [id*='soldBy']");
      const link = soldBy?.querySelector("a[href*='seller=']") ?? b.querySelector("a[href*='seller=']");
      const shipsFrom = text(b.querySelector("#aod-offer-shipsFrom, [id*='shipsFrom']"));
      return {
        sellerId: sellerIdFrom(link) ?? (/amazon/i.test(text(soldBy)) ? "AMAZON" : "unknown"),
        name: link ? text(link) : text(soldBy).replace(/^Sold by\s*/i, "") || null,
        isAmazon: !link && /amazon/i.test(text(soldBy)),
        fba: /amazon/i.test(shipsFrom),
        oid: offerListingId(b),
        form: b.querySelector("form"),
      };
    });
    note("AOD offers", { found: offers.length, fba: offers.filter((o) => o.fba && !o.isAmazon).length, withListingId: offers.filter((o) => o.oid).length });
    return offers;
  }

  /** Fallback: the Buy Box offer and the "Other sellers on Amazon" rows shown on this page. */
  function offersOnPage() {
    const out = [];
    const bbOid = document.querySelector("#offerListingID, input[name='offerListingID']")?.value;
    const bbSeller = document.querySelector("#merchantID, input[name='merchantID']")?.value;
    const bbShips = text(document.querySelector("#fulfillerInfoFeature_feature_div, #tabular-buybox, #shipsFromSoldBy_feature_div"));
    if (bbOid && bbSeller) {
      out.push({ sellerId: bbSeller, name: text(document.querySelector("#sellerProfileTriggerId")) || null, isAmazon: bbSeller === "A3P5ROKL5A1OLE", fba: /amazon/i.test(bbShips), oid: bbOid, form: null });
    }
    for (const row of document.querySelectorAll("#mbc .mbc-offer-row, #mbc-action-panel .a-box, #olpLinkWidget_feature_div [data-csa-c-content-id], .mbc-offer-row")) {
      const link = row.querySelector("a[href*='seller=']");
      const oid = offerListingId(row);
      if (!link || !oid) continue;
      out.push({ sellerId: sellerIdFrom(link), name: text(link), isAmazon: false, fba: /amazon/i.test(text(row)), oid, form: row.querySelector("form") });
    }
    return out;
  }

  async function post(url, body, extraHeaders = {}) {
    const res = await fetch(new URL(url, location.origin), { method: "POST", body, credentials: "include", headers: extraHeaders });
    return { res, body: await res.text() };
  }

  /** Amazon's anti-CSRF token on this page, for the add-to-cart call. */
  const csrf = () => document.querySelector("input[name='anti-csrftoken-a2z']")?.value
    || document.querySelector("meta[name='anti-csrftoken-a2z']")?.getAttribute("content") || null;

  async function cartDoc() {
    const res = await fetch("/gp/cart/view.html?ref_=nav_cart", { credentials: "include" });
    const body = await res.text();
    return { doc: parse(body), body, status: res.status };
  }
  async function cartHas(a) {
    return !!(await cartDoc()).doc.querySelector(`[data-asin="${a}"]`);
  }

  /** "only 12 left", "only 12 of these available", "limited to 3 per customer", or a quantity field. */
  function readQuantity(scope) {
    const t = text(scope);
    const n = (x) => (x == null ? null : Number(String(x).replace(/[^\d]/g, "")) || null);
    const limit = t.match(/limit(?:ed)?(?: of| to)? (\d[\d,]*) per customer/i) || t.match(/quantity (?:is )?limited to (\d[\d,]*)/i);
    if (limit) return { stock: n(limit[1]), limited: true };
    const only = t.match(/only (\d[\d,]*) (?:left|of these|are available|available)/i);
    if (only) return { stock: n(only[1]), limited: false };
    const field = scope.getAttribute?.("data-quantity") || scope.querySelector?.("input[name^='quantityBox'], input[name='quantity']")?.value
      || text(scope.querySelector?.("select[name='quantity'] option[selected], [data-a-selector='value']"));
    return field && n(field) != null ? { stock: n(field), limited: false } : null;
  }

  /** Add 999 of one offer by its listing ID, read what Amazon allows, then take it out again. */
  async function stockOf(offer) {
    const first = !debug.some((d) => d.step.startsWith("Add"));
    let added = null;
    // 1. The offer's own add-to-cart form, when the block has one.
    if (offer.form) {
      const body = new URLSearchParams();
      for (const el of offer.form.querySelectorAll("input[name]")) if (el.type !== "submit" && el.type !== "image") body.set(el.name, el.value);
      for (const k of [...body.keys()]) if (/quantity/i.test(k)) body.set(k, "999");
      if (![...body.keys()].some((k) => /quantity/i.test(k))) body.set("quantity", "999");
      added = await post(offer.form.getAttribute("action") || "/gp/add-to-cart/html", body);
      if (first) note("Add (offer form)", { status: added.res.status, body: snippet(added.body) });
    }
    // 2. Amazon's add-to-cart call with the offer listing ID.
    if (!added || !added.res.ok) {
      const body = new URLSearchParams({
        "items[0.base][asin]": asin, "items[0.base][offerListingId]": offer.oid, "items[0.base][quantity]": "999",
        clientName: "OffersX_OfferDisplay_DetailPage",
      });
      const token = csrf();
      added = await post("/cart/add-to-cart/ref=dp_start-bbf_1_glance", body, token ? { "anti-csrftoken-a2z": token } : {});
      if (first) note("Add (add-to-cart)", { status: added.res.status, body: snippet(added.body) });
    }
    // 3. The classic cart form (it may ask to confirm; the confirmation is submitted).
    if (!added.res.ok) {
      const res = await fetch(`/gp/aws/cart/add.html?ASIN.1=${asin}&OfferListingId.1=${encodeURIComponent(offer.oid)}&Quantity.1=999`, { credentials: "include" });
      added = { res, body: await res.text() };
      const confirm = parse(added.body).querySelector("form[action*='cart'] input[type='submit'], form[action*='cart'] input[name='add']")?.closest("form");
      if (confirm) {
        const body = new URLSearchParams([...confirm.querySelectorAll("input[name]")].map((i) => [i.name, i.value]));
        added = await post(confirm.getAttribute("action"), body);
      }
      if (first) note("Add (cart form)", { status: added.res.status, body: snippet(added.body) });
    }
    if (!added.res.ok) throw new Error(`adding to the cart failed (${added.res.status})`);

    // The add response often carries the message itself; otherwise the cart line does.
    const fromAdd = readQuantity(parse(added.body).body);
    const cart = await cartDoc();
    if (first) note("Cart", { status: cart.status, body: snippet(cart.body) });
    const line = cart.doc.querySelector(`[data-asin="${asin}"]`);
    try {
      const got = (line && readQuantity(line)) || fromAdd;
      if (!line && !fromAdd) throw new Error("not in the cart after adding (see Debug)");
      if (!got) throw new Error("the cart didn't show a quantity (see Debug)");
      return got;
    } finally {
      await removeLine(cart.doc).catch((e) => note("Remove failed", { error: e.message }));
    }
  }

  /** Take this ASIN's line out of the cart. */
  async function removeLine(doc) {
    const line = doc.querySelector(`[data-asin="${asin}"]`);
    if (!line) return;
    const del = line.querySelector("input[value='Delete'], input[name^='submit.delete'], input[data-action='delete']");
    const form = del?.closest("form") || doc.querySelector("#activeCartViewForm");
    if (del && form) {
      const body = new URLSearchParams([...form.querySelectorAll("input[type='hidden'][name]")].map((i) => [i.name, i.value]));
      body.set(del.name, del.value || "Delete");
      await post(form.getAttribute("action") || "/gp/cart/view.html", body);
      return;
    }
    // Newer carts: set the line's quantity to 0 through its update form.
    const itemId = line.getAttribute("data-itemid");
    if (itemId && form) {
      const body = new URLSearchParams([...form.querySelectorAll("input[type='hidden'][name]")].map((i) => [i.name, i.value]));
      body.set(`quantity.${itemId}`, "0");
      await post(form.getAttribute("action") || "/gp/cart/view.html", body);
      return;
    }
    throw new Error("couldn't find the cart line's delete control; remove it by hand");
  }

  ws.send({ type: "settings" }).then((s) => {
    settings = s;
    render();
    if (s.configured && s.autoCheck) load(false);
  });
})();
