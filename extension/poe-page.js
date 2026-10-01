// Opportunity Explorer, page world: watches the responses Seller Central's own page receives from
// its niche API (POST /ox-api/graphql, operation getNiche) and growth widget
// (/insightswidget-api/growth) and hands a copy to the extension's panel (poe.js) by postMessage.
// It never changes a request or a response, never sends anything anywhere and never acts on the
// page: it only reads what the page already fetched. Nothing leaves the browser until you click
// "Send to Gatekeeper" in the panel.
(() => {
  if (window.__wsPoeObserver) return;
  window.__wsPoeObserver = true;

  const isGraphql = (url) => /\/ox-api\/graphql/.test(url);
  const isGrowth = (url) => /\/insightswidget-api\/growth/.test(url);

  /** The GraphQL request's operation name and variables, from its body. */
  function operation(body) {
    if (typeof body !== "string") return null;
    try {
      const b = JSON.parse(body);
      const one = Array.isArray(b) ? b.find((x) => x && x.operationName) : b;
      return one ? { name: one.operationName || "", variables: one.variables || null } : null;
    } catch {
      return null;
    }
  }

  function hand(kind, url, data, variables) {
    try {
      window.postMessage({ source: "wholesale-scout-poe", kind, url: String(url), data, variables: variables || null }, location.origin);
    } catch { /* a payload the structured clone can't copy: ignore it */ }
  }

  function observe(url, reqBody, text) {
    if (!text) return;
    let data;
    try { data = JSON.parse(text); } catch { return; }
    if (isGraphql(url)) {
      const op = operation(reqBody);
      if (op && /getNiche/i.test(op.name)) hand("niche", url, data, op.variables);
    } else if (isGrowth(url)) {
      hand("growth", url, data, null);
    }
  }

  const watched = (url) => isGraphql(url) || isGrowth(url);

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      if (watched(url)) {
        const body = init && typeof init.body === "string" ? init.body : null;
        p.then((res) => res.clone().text().then((t) => observe(url, body, t))).catch(() => {});
      }
    } catch { /* never get in the page's way */ }
    return p;
  };

  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open, origSend = XHR.send;
  XHR.open = function (method, url) {
    this.__wsUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XHR.send = function (body) {
    try {
      if (this.__wsUrl && watched(this.__wsUrl)) {
        const url = this.__wsUrl, reqBody = typeof body === "string" ? body : null;
        this.addEventListener("load", () => {
          try {
            const t = this.responseType === "" || this.responseType === "text" ? this.responseText : this.responseType === "json" ? JSON.stringify(this.response) : null;
            observe(url, reqBody, t);
          } catch { /* ignore */ }
        });
      }
    } catch { /* never get in the page's way */ }
    return origSend.apply(this, arguments);
  };
})();
