// Settings: the app's URL and password (kept in chrome.storage.local on this computer only),
// the Seller Central DG page, and a connection test.
const DEFAULTS = { appUrl: "https://wholesale-scout.vercel.app", password: "", dgUrl: "https://sellercentral.amazon.co.uk/product-search/search?q={asin}", autoCheck: true };
const $ = (id) => document.getElementById(id);
const msg = (text, ok) => { $("msg").textContent = text; $("msg").className = ok ? "ok" : "err"; };

chrome.storage.local.get(DEFAULTS, (s) => {
  $("appUrl").value = s.appUrl;
  $("password").value = s.password;
  $("dgUrl").value = s.dgUrl;
  $("autoCheck").checked = s.autoCheck !== false;
});

async function save() {
  let appUrl = $("appUrl").value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(appUrl)) appUrl = `https://${appUrl}`;
  let origin;
  try { origin = new URL(appUrl).origin; } catch { msg("That isn't a URL."); return false; }
  // Calls go from the extension's background, so it needs permission for the app's address.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) { msg("Allow access to the app's address to connect."); return false; }
  await chrome.storage.local.set({ appUrl, password: $("password").value, dgUrl: $("dgUrl").value.trim() || DEFAULTS.dgUrl, autoCheck: $("autoCheck").checked });
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
