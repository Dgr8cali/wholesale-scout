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

// Capture reviews on this page: the same parser as the page's panel (reviews-parse.js), run in the
// active tab on demand (activeTab + scripting), so it works even where the panel didn't load.
const revMsg = (text, cls) => { $("revMsg").textContent = text; $("revMsg").className = cls || ""; };
const revApi = (body) => new Promise((resolve) => chrome.runtime.sendMessage({ type: "api", method: "POST", path: "/api/pl/reviews/capture", body }, (r) => resolve(r || { ok: false, error: "No answer" })));

$("revCapture").addEventListener("click", async () => {
  $("revSend").replaceChildren();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/www\.amazon\.co\.uk\//.test(tab.url || "")) return revMsg("Open an amazon.co.uk product or reviews page first.", "err");
  let parsed;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["reviews-parse.js"] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__wsReviewsParse.parseAmazonReviews(document, location.href) });
    parsed = res?.result;
  } catch (e) {
    return revMsg(`Couldn't read the page: ${e.message}`, "err");
  }
  if (!parsed?.reviews?.length) return revMsg("No reviews found on this page — open the 'See all reviews' page and try again.", "err");
  if (!parsed.asin) return revMsg(`Found ${parsed.reviews.length} reviews, but not this page's ASIN.`, "err");
  // Into the same capture the page's panel keeps (by review id).
  const key = `wsReviews:${parsed.asin}`;
  const cap = (await chrome.storage.local.get(key))[key] || { asin: parsed.asin, reviews: {}, pages: [], sentAt: null };
  for (const r of parsed.reviews) cap.reviews[r.id || `${r.stars}|${r.title}|${r.body.slice(0, 80)}`] = r;
  await chrome.storage.local.set({ [key]: cap });
  const critical = parsed.reviews.filter((r) => r.stars != null && r.stars <= 3).length;
  const all = Object.values(cap.reviews);
  revMsg(`Captured ${parsed.reviews.length} reviews (${critical} critical) for ${parsed.asin}. ${all.length} in this listing's capture.`, "ok");
  sendButton(cap);
});

function sendButton(cap, candidateId, mode) {
  const box = $("revSend");
  const send = async (id, m) => {
    revMsg("Sending…");
    const r = await revApi({ asin: cap.asin, reviews: Object.values(cap.reviews), candidateId: id, mode: m });
    if (!r.ok) return revMsg(r.error, "err");
    const d = r.data;
    box.replaceChildren();
    if (d.saved) {
      cap.sentAt = new Date().toISOString();
      await chrome.storage.local.set({ [`wsReviews:${cap.asin}`]: cap });
      return revMsg(`Sent to “${d.candidate.name}”: ${d.saved.added} new, ${d.saved.inDump} at 1–3★ in Gate 4.${d.saved.onCandidate === false ? ` ${cap.asin} isn't on this candidate: add it or keep it separate in Gate 4.` : ""}`, "ok");
    }
    if (d.conflict) {
      revMsg(`“${d.candidate.name}” already has reviews you pasted for ${cap.asin}.`);
      const add = document.createElement("button"); add.className = "p"; add.textContent = "Add to them"; add.onclick = () => send(d.candidate.id, "append");
      const rep = document.createElement("button"); rep.textContent = "Replace them"; rep.onclick = () => send(d.candidate.id, "replace");
      return box.replaceChildren(add, rep);
    }
    if (!d.pick?.length) return revMsg("There's no candidate to send them to: add one on the Private label page.", "err");
    revMsg(d.hasAsin ? `${d.pick.length} candidates have ${cap.asin}. Send to:` : `No candidate has ${cap.asin} among its page-one ASINs. Send to:`);
    const sel = document.createElement("select");
    sel.style.cssText = "width:100%;padding:6px;border:1px solid #d4d4d8;border-radius:6px;margin-bottom:6px";
    for (const c of d.pick) { const o = document.createElement("option"); o.value = c.id; o.textContent = c.niche_keyword ? `${c.name} (${c.niche_keyword})` : c.name; sel.append(o); }
    const go = document.createElement("button"); go.className = "p"; go.textContent = "Send"; go.onclick = () => send(sel.value);
    box.replaceChildren(sel, go);
  };
  const b = document.createElement("button");
  b.className = "p";
  b.textContent = `Send ${Object.keys(cap.reviews).length} reviews to Private label`;
  b.onclick = () => send(candidateId, mode);
  box.replaceChildren(b);
}
