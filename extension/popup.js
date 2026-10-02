// Settings: the app's URL and password (kept in chrome.storage.local on this computer only),
// the Seller Central DG page, and a connection test.
const DEFAULTS = { appUrl: "https://wholesale-scout.vercel.app", password: "", dgUrl: "https://sellercentral.amazon.co.uk/product-search/search?q={asin}", autoCheck: true, showDebug: false, poeOtherMarkets: false };
const $ = (id) => document.getElementById(id);
const msg = (text, ok) => { $("msg").textContent = text; $("msg").className = ok ? "ok" : "err"; };

chrome.storage.local.get(DEFAULTS, (s) => {
  $("appUrl").value = s.appUrl;
  $("password").value = s.password;
  $("dgUrl").value = s.dgUrl;
  $("autoCheck").checked = s.autoCheck !== false;
  $("showDebug").checked = !!s.showDebug;
  $("poeOtherMarkets").checked = !!s.poeOtherMarkets;
});

async function save() {
  let appUrl = $("appUrl").value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(appUrl)) appUrl = `https://${appUrl}`;
  let origin;
  try { origin = new URL(appUrl).origin; } catch { msg("That isn't a URL."); return false; }
  // Calls go from the extension's background, so it needs permission for the app's address.
  const other = $("poeOtherMarkets").checked;
  const origins = [`${origin}/*`, ...(other ? ["https://sellercentral.amazon.com/*", "https://sellercentral.amazon.de/*"] : [])];
  const granted = await chrome.permissions.request({ origins });
  if (!granted) { msg(other ? "Allow access to the app's address and Seller Central .com/.de, or untick that option." : "Allow access to the app's address to connect."); return false; }
  await chrome.storage.local.set({ appUrl, password: $("password").value, dgUrl: $("dgUrl").value.trim() || DEFAULTS.dgUrl, autoCheck: $("autoCheck").checked, showDebug: $("showDebug").checked, poeOtherMarkets: other });
  await new Promise((r) => chrome.runtime.sendMessage({ type: "poeMarkets" }, r));
  $("appUrl").value = appUrl;
  return true;
}

$("save").addEventListener("click", async () => { if (await save()) msg("Saved.", true); });
$("test").addEventListener("click", async () => {
  if (!(await save())) return;
  msg("Testing…", true);
  chrome.runtime.sendMessage({ type: "api", method: "GET", path: "/api/extension/ping" }, (r) => {
    if (r?.ok && r.data?.app === "wholesale-scout") msg("Connected: the app accepted the password.", true);
    else msg(r?.error || "No answer.");
  });
});

// Check ranks: the products and their tracked keywords come from the app; the run happens in a tab (ranks.js).
let rankTargets = [];
let rankCap = 30;
const rankMsg = (text, ok) => { $("rankMsg").textContent = text; $("rankMsg").className = ok ? "ok" : "err"; };
function showRankInfo() {
  const t = rankTargets.find((x) => x.asin === $("rankAsin").value);
  $("rankGo").disabled = !t || !t.keywords.length;
  $("rankInfo").textContent = !t ? "" : t.keywords.length
    ? `${t.keywords.length} keyword${t.keywords.length === 1 ? "" : "s"}${t.keywords.length > rankCap ? ` (the first ${rankCap} are checked)` : ""}: ${t.keywords.slice(0, 6).join(", ")}${t.keywords.length > 6 ? "…" : ""}`
    : "No exact keywords or added keywords for this product yet.";
}
chrome.runtime.sendMessage({ type: "rankState" }, (s) => { if (s?.running) rankMsg(`A check of ${s.asin} is running (${s.results.length} of ${s.keywords.length}).`, true); });
chrome.runtime.sendMessage({ type: "api", method: "GET", path: "/api/ads/ranks" }, (r) => {
  if (!r?.ok) { $("rankAsin").innerHTML = "<option value=''>Couldn't load products</option>"; rankMsg(r?.error || "No answer."); return; }
  rankTargets = r.data.targets || [];
  rankCap = r.data.cap || 30;
  $("rankAsin").innerHTML = rankTargets.length
    ? rankTargets.map((t) => `<option value="${t.asin}">${t.asin}${t.title ? ` · ${t.title.slice(0, 30)}` : ""} (${t.keywords.length})</option>`).join("")
    : "<option value=''>No Ads products yet</option>";
  showRankInfo();
});
$("rankAsin").addEventListener("change", showRankInfo);
$("rankGo").addEventListener("click", () => {
  const t = rankTargets.find((x) => x.asin === $("rankAsin").value);
  if (!t) return;
  chrome.runtime.sendMessage({ type: "rankStart", asin: t.asin, keywords: t.keywords }, (r) => {
    if (r?.ok) rankMsg(`Checking ${r.count} keywords in a new tab. Results are saved to the app at the end (or when you Stop).`, true);
    else rankMsg(r?.error || "No answer.");
  });
});
