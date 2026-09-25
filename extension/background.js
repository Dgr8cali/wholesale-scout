// Wholesale Scout: the only part of the extension that talks to the app. Content scripts ask
// it by message; it adds the password (Bearer APP_PASSWORD) and calls the app you configured.

const DEFAULTS = {
  appUrl: "https://wholesale-scout.vercel.app",
  password: "",
  // Seller Central page to open for a DG look-up; {asin} is replaced.
  dgUrl: "https://sellercentral.amazon.co.uk/product-search/search?q={asin}",
  // Check a product page as soon as it opens (a new ASIN is a check run: a few Keepa tokens).
  autoCheck: true,
};

async function settings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s, appUrl: String(s.appUrl || DEFAULTS.appUrl).replace(/\/+$/, "") };
}

async function api(method, path, body) {
  const s = await settings();
  if (!s.password) return { ok: false, status: 0, error: "Set the app URL and password in the extension's popup first." };
  try {
    const res = await fetch(`${s.appUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${s.password}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, error: data?.error || (res.status === 401 ? "Wrong password" : `The app answered ${res.status}`) };
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: `Couldn't reach ${s.appUrl}: ${e.message}. If it's a new address, save it again in the popup to allow access.` };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg.type === "api") return reply(await api(msg.method || "GET", msg.path, msg.body));
    if (msg.type === "settings") {
      const s = await settings();
      return reply({ appUrl: s.appUrl, dgUrl: s.dgUrl, configured: !!s.password, autoCheck: s.autoCheck !== false });
    }
    if (msg.type === "open") {
      await chrome.tabs.create({ url: msg.url });
      return reply({ ok: true });
    }
    if (msg.type === "dgLookup") {
      // Remember which ASIN the Seller Central page is for; the reader there picks it up.
      const s = await settings();
      await chrome.storage.local.set({ pendingDg: { asin: msg.asin, at: Date.now() } });
      await chrome.tabs.create({ url: s.dgUrl.replace("{asin}", encodeURIComponent(msg.asin)) });
      return reply({ ok: true });
    }
    reply({ ok: false, error: `Unknown message ${msg.type}` });
  })();
  return true; // reply asynchronously
});
