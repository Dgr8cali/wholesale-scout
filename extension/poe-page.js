// Opportunity Explorer, page world: watches the responses Seller Central's own page receives from
// its GraphQL API (POST /ox-api/graphql: getNiche, and whatever the page's tabs load later) and its
// insights widget (/insightswidget-api/growth), and hands a copy of each, with its operation name,
// to the extension's panel (poe.js) by postMessage.
// It never changes a request or a response, never sends anything anywhere and never acts on the
// page: it only reads what the page already fetched. Nothing leaves the browser until you click
// "Send to Private label" in the panel.
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

  function hand(kind, url, data, variables, op) {
    try {
      window.postMessage({ source: "wholesale-scout-poe", kind, op: op || null, url: String(url), data, variables: variables || null }, location.origin);
    } catch { /* a payload the structured clone can't copy: ignore it */ }
  }

  function observe(url, reqBody, text) {
    if (!text) return;
    let data;
    try { data = JSON.parse(text); } catch { return; }
    if (isGraphql(url)) {
      // Every operation: the panel keeps them all for the niche page (tabs load data lazily).
      const op = operation(reqBody);
      hand("graphql", url, data, op ? op.variables : null, op ? op.name : "(unnamed)");
    } else if (isGrowth(url)) {
      hand("growth", url, data, null);
    }
  }

  const watched = (url) => isGraphql(url) || isGrowth(url);

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    let url = null, body = null;
    try {
      url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      if (watched(url)) {
        // The operation name is in the request body: in init, or on a Request object passed in.
        // A Request's body must be copied before the page's fetch reads it.
        body = init && typeof init.body === "string" ? Promise.resolve(init.body)
          : input && typeof input === "object" && typeof input.clone === "function" ? input.clone().text().catch(() => null)
          : Promise.resolve(null);
      } else url = null;
    } catch { url = null; /* never get in the page's way */ }
    const p = origFetch.apply(this, arguments);
    if (url) p.then((res) => Promise.all([body, res.clone().text()]).then(([b, t]) => observe(url, b, t))).catch(() => {});
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
