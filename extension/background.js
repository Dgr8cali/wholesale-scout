// Wholesale Scout: the only part of the extension that talks to the app. Content scripts ask
// it by message; it adds the password (Bearer APP_PASSWORD) and calls the app you configured.

const DEFAULTS = {
  appUrl: "https://wholesale-scout.vercel.app",
  password: "",
  // Seller Central page to open for a DG look-up; {asin} is replaced.
  dgUrl: "https://sellercentral.amazon.co.uk/product-search/search?q={asin}",
  // Check a product page as soon as it opens (a new ASIN is a check run: a few Keepa tokens).
  autoCheck: true,
  // The stock reader's Debug section (what Amazon sent back at each step), for fixing the reader.
  showDebug: false,
  // Opportunity Explorer on sellercentral.amazon.com and .de as well as .co.uk (off: .co.uk only).
  poeOtherMarkets: false,
};

const POE_OTHER = ["https://sellercentral.amazon.com/opportunity-explorer/*", "https://sellercentral.amazon.de/opportunity-explorer/*"];

/** The .com/.de Opportunity Explorer scripts: registered only while the setting is on and allowed. */
async function syncPoeMarkets() {
  const s = await chrome.storage.local.get({ poeOtherMarkets: false });
  const allowed = await chrome.permissions.contains({ origins: ["https://sellercentral.amazon.com/*", "https://sellercentral.amazon.de/*"] }).catch(() => false);
  const ids = ["ws-poe-page", "ws-poe-panel"];
  const have = (await chrome.scripting.getRegisteredContentScripts({ ids }).catch(() => [])).map((x) => x.id);
  if (have.length) await chrome.scripting.unregisterContentScripts({ ids: have });
  if (!s.poeOtherMarkets || !allowed) return;
  await chrome.scripting.registerContentScripts([
    { id: "ws-poe-page", matches: POE_OTHER, js: ["poe-page.js"], world: "MAIN", runAt: "document_start" },
    { id: "ws-poe-panel", matches: POE_OTHER, js: ["shared.js", "poe.js"], runAt: "document_start" },
  ]);
}
chrome.runtime.onInstalled.addListener(() => { syncPoeMarkets(); });
chrome.runtime.onStartup.addListener(() => { syncPoeMarkets(); });

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
      return reply({ appUrl: s.appUrl, dgUrl: s.dgUrl, configured: !!s.password, autoCheck: s.autoCheck !== false, showDebug: !!s.showDebug });
    }
    if (msg.type === "poeMarkets") {
      await syncPoeMarkets();
      return reply({ ok: true });
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
