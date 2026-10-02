// Rank checks (background): for one product, search each tracked keyword on amazon.co.uk in a tab
// you can see, one at a time with a 3–6 second random pause, read where the product sits among the
// organic results (1–48, up to 3 pages), and post the run to the app (/api/ads/ranks). Started only
// from the popup's "Check ranks", one run at a time, at most 30 keywords, with Stop in the tab.

const RANK_CAP = 30;
const RANK = { running: false, keywords: [], results: [] };
const rankSleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 3–6 seconds, random, before every search. */
const rankPause = () => rankSleep(3000 + Math.random() * 3000);

function rankState() {
  return { running: RANK.running, asin: RANK.asin, keywords: RANK.keywords, results: RANK.results, status: RANK.status || "", error: RANK.error || null, saved: RANK.saved ?? null, stopped: !!RANK.stopped };
}

function rankWaitLoaded(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); reject(new Error("Amazon took over 30 s to load")); }, timeout);
    const l = (id, info) => { if (id === tabId && info.status === "complete") { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } };
    chrome.tabs.onUpdated.addListener(l);
  });
}
async function rankGo(tabId, url) {
  const loaded = rankWaitLoaded(tabId);
  await chrome.tabs.update(tabId, { url });
  await loaded;
}
async function rankInPage(tabId, func, args) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["rankread.js"] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r?.result;
}
const rankPanel = (tabId) => rankInPage(tabId, (s) => globalThis.__wsRank.panel(s), [rankState()]).catch(() => {});

async function runRanks(asin, keywords) {
  Object.assign(RANK, { running: true, stopped: false, stop: false, asin, keywords: [...new Set(keywords)].slice(0, RANK_CAP), results: [], status: "", error: null, saved: null, runId: crypto.randomUUID() });
  const tab = await chrome.tabs.create({ url: "https://www.amazon.co.uk/", active: true });
  RANK.tabId = tab.id;
  try {
    for (let i = 0; i < RANK.keywords.length && !RANK.stop; i++) {
      const kw = RANK.keywords[i];
      let position = null, page = null, seen = 0;
      for (let pg = 1; pg <= 3 && !RANK.stop; pg++) {
        await rankPause();
        if (RANK.stop) break;
        await rankGo(tab.id, `https://www.amazon.co.uk/s?k=${encodeURIComponent(kw)}${pg > 1 ? `&page=${pg}` : ""}`);
        const r = await rankInPage(tab.id, (a) => globalThis.__wsRank.read(a), [asin]);
        if (!r) throw new Error("Couldn't read the search page");
        if (r.captcha) throw new Error("Amazon asked for a captcha, so the run stopped. Solve it in this tab and check again later.");
        if (r.index != null) { position = seen + r.index + 1; page = pg; break; }
        seen += r.organic.length;
        if (seen >= 48 || !r.hasNext) break;
        RANK.status = `not on page ${pg} (${seen} organic results so far): page ${pg + 1}`;
        await rankPanel(tab.id);
      }
      if (RANK.stop) break;
      if (position != null && position > 48) { position = null; page = null; }
      RANK.results.push({ keyword: kw, position, page, checkedAt: new Date().toISOString() });
      RANK.status = "";
      await rankPanel(tab.id);
    }
  } catch (e) {
    RANK.error = e.message;
  }
  RANK.stopped = RANK.stop;
  if (RANK.results.length) {
    const r = await api("POST", "/api/ads/ranks", { asin, runId: RANK.runId, results: RANK.results });
    if (r.ok) RANK.saved = r.data.saved;
    else RANK.error = `${RANK.error ? `${RANK.error} ` : ""}Couldn't save to the app: ${r.error}`;
  }
  RANK.running = false;
  await rankPanel(tab.id);
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "rankStart") {
    if (RANK.running) { reply({ ok: false, error: "A rank check is already running: stop it first" }); return; }
    if (!/^[A-Z0-9]{10}$/.test(msg.asin || "") || !Array.isArray(msg.keywords) || !msg.keywords.length) { reply({ ok: false, error: "Pick a product with keywords" }); return; }
    runRanks(msg.asin, msg.keywords);
    reply({ ok: true, count: Math.min(RANK_CAP, msg.keywords.length) });
    return;
  }
  if (msg.type === "rankStop") { RANK.stop = true; reply({ ok: true }); return; }
  if (msg.type === "rankState") { reply(rankState()); return; }
});
