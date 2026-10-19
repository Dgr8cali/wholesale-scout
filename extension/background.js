// Wholesale Scout: the only part of the extension that talks to the app. Content scripts ask
// it by message; it adds the password (Bearer APP_PASSWORD) and calls the app you configured.

const DEFAULTS = {
  appUrl: "https://ws.dgr8cali.co.uk",
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

/**
 * The .com/.de Opportunity Explorer scripts: registered only while the setting is on and allowed.
 * One at a time (install, start-up and the popup can ask together; two at once registered the same
 * id twice), and never an uncaught error.
 */
let poeSync = Promise.resolve();
function syncPoeMarkets() {
  poeSync = poeSync.then(syncPoeMarketsNow).catch((e) => console.info("[Wholesale Scout] Opportunity Explorer scripts for .com/.de not updated:", e?.message || e));
  return poeSync;
}
async function syncPoeMarketsNow() {
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

// The app moved off Vercel (17 Oct 2026); the old address only redirects, and a redirect drops the
// password. A saved old address is moved to the new one.
const OLD_APP_URL = /^https?:\/\/wholesale-scout\.vercel\.app\/*$/i;

async function settings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  if (OLD_APP_URL.test(String(s.appUrl))) {
    s.appUrl = DEFAULTS.appUrl;
    await chrome.storage.local.set({ appUrl: s.appUrl });
  }
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

/** Answer a content script or the popup; a tab or popup that closed meanwhile isn't an error. */
function safeReply(reply, value) {
  try { reply(value); } catch { /* the sender went away (tab closed, page reloaded, popup shut) */ }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Rank-check messages are answered by ranks.js.
  if (!msg || typeof msg.type !== "string" || msg.type.startsWith("rank")) return false;
  const reply = (v) => safeReply(sendResponse, v);
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
  })().catch((e) => reply({ ok: false, error: String(e?.message || e) }));
  return true; // reply asynchronously
});

// Rank checks (Ads): a manual run per click from the popup.
importScripts("ranks.js");
