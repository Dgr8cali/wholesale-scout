import "server-only";
import { bankStatus, buildBank, headTermsFromBank, type BankRow, type BankSource } from "../ads/bank";
import type { BulkChange } from "../ads/bulk";
import { listsFor, normTerm, parseList, type KeywordLists, type ProductLists } from "../ads/lists";
import { conversionTxt, priorConversion, smoothedConversion } from "../ads/smooth";
import { adsDashboard, adsSettings, loadAll } from "./ads";
import { rankHistory, setRankKeyword } from "./adsOps";
import { ngramReport } from "./adsRules";
import { db, must, selectAll } from "./db";

const isAsin = (s: string) => /^[A-Z0-9]{10}$/.test(s);
const now = () => new Date().toISOString();

/* ===================== whitelist and blacklist ===================== */

/** The account's lists and each product's (its own terms, and whether the account's apply). */
export async function keywordLists(): Promise<{ account: KeywordLists; products: Record<string, ProductLists> }> {
  const res = await db().from("ads_keyword_lists").select("scope, kind, terms, use_account");
  const rows = (res.error ? [] : res.data) as { scope: string; kind: "whitelist" | "blacklist"; terms: string[]; use_account: boolean }[];
  const account: KeywordLists = { whitelist: [], blacklist: [] };
  const products: Record<string, ProductLists> = {};
  for (const r of rows) {
    if (r.scope === "account") account[r.kind] = r.terms ?? [];
    else {
      const p = (products[r.scope] ??= { whitelist: [], blacklist: [], useAccount: true });
      p[r.kind] = r.terms ?? [];
      if (r.kind === "whitelist" || r.use_account === false) p.useAccount = r.use_account !== false;
    }
  }
  return { account, products };
}

/** Each product's lists as the rules use them: its own plus the account's (unless it leaves them out). */
export async function listsByAsin(asins: string[]): Promise<Record<string, KeywordLists>> {
  const { account, products } = await keywordLists();
  return Object.fromEntries(asins.map((a) => [a, listsFor(account, products[a] ?? null)]));
}

/** Save a list: scope "account" or an ASIN; terms one a line (or comma). */
export async function saveKeywordLists(scope: string, x: { whitelist?: string | string[]; blacklist?: string | string[]; useAccount?: boolean }) {
  const s = scope === "account" ? "account" : scope.toUpperCase();
  if (s !== "account" && !isAsin(s)) throw new Error("Scope: account or an ASIN");
  const rows: Record<string, unknown>[] = [];
  for (const kind of ["whitelist", "blacklist"] as const) {
    if (x[kind] === undefined && x.useAccount === undefined) continue;
    const cur = (await keywordLists());
    const existing = s === "account" ? cur.account[kind] : cur.products[s]?.[kind] ?? [];
    rows.push({ scope: s, kind, terms: x[kind] !== undefined ? parseList(x[kind]!) : existing, use_account: s === "account" ? true : x.useAccount ?? cur.products[s]?.useAccount ?? true, updated_at: now() });
  }
  if (rows.length) must(await db().from("ads_keyword_lists").upsert(rows, { onConflict: "scope,kind" }), "save keyword lists");
  return keywordLists();
}

/* ===================== the keyword bank ===================== */

/** Every source for a product's bank, and what the ads say about each term. */
export async function keywordBank(asin: string): Promise<{ asin: string; rows: BankRow[]; counts: Record<BankSource, number>; candidate: string | null; headTerms: string[] }> {
  const a = asin.toUpperCase();
  if (!isAsin(a)) throw new Error("An ASIN is 10 letters and digits");
  const d = db();
  const [prod, harvested, manual, tracked, all, ranks, ngrams] = await Promise.all([
    d.from("ads_products").select("pl_candidate_id").eq("asin", a).maybeSingle(),
    d.from("ads_proposals").select("entity, rule").eq("asin", a).in("rule", ["harvest", "ngram_winner"]),
    d.from("ads_keyword_bank").select("text").eq("asin", a),
    d.from("ads_rank_keywords").select("keyword").eq("asin", a),
    loadAll(), rankHistory(), ngramReport(),
  ]);
  const candidate = (prod.data as { pl_candidate_id: string | null } | null)?.pl_candidate_id ?? null;
  const poe = candidate
    ? (((await d.from("pl_poe_snapshots").select("search_terms").eq("candidate_id", candidate).order("captured_at", { ascending: false }).limit(1)).data ?? []) as { search_terms: { term: string; volume: number }[] | null }[])[0]?.search_terms ?? []
    : [];
  const myCampaigns = new Set(all.campaigns.filter((c) => c.asin === a).map((c) => c.id));
  const mine = [...myCampaigns];
  const kws = (mine.length ? await selectAll<{ campaign: string; keyword_text: string; match_type: string; state: string | null }>("ads_keywords", "campaign, keyword_text, match_type, state", ["keyword_id"], (q) => q.in("campaign", mine)) : []).filter((k) => !/archived/i.test(k.state ?? ""));
  const negs = mine.length ? await selectAll<{ campaign: string; keyword_text: string; match_type: string }>("ads_negative_keywords", "campaign, keyword_text, match_type", ["keyword_id"], (q) => q.in("campaign", mine)) : [];
  const myRanks = ranks[a] ?? {};
  const sources: { text: string; source: BankSource; searches?: number | null }[] = [
    ...poe.map((t) => ({ text: t.term, source: "poe" as const, searches: t.volume })),
    ...((harvested.data ?? []) as { entity: { label: string; type: string } }[]).filter((p) => p.entity.type === "search term").map((p) => ({ text: p.entity.label, source: "harvested" as const })),
    ...ngrams.rows.filter((g) => g.asin === a && g.trigger === "winner").map((g) => ({ text: g.gram, source: "ngram" as const })),
    ...[...new Set([...Object.keys(myRanks), ...((tracked.data ?? []) as { keyword: string }[]).map((t) => t.keyword)])].map((k) => ({ text: k, source: "rank" as const })),
    ...((manual.data ?? []) as { text: string }[]).map((m) => ({ text: m.text, source: "manual" as const })),
  ];
  const rows = buildBank({
    sources,
    terms: (all.terms as Record<string, unknown>[]).filter((t) => myCampaigns.has(t.campaign as string)).map((t) => ({ term: t.term as string, clicks: Number(t.clicks), cost: Number(t.cost), orders: Number(t.orders), sales: Number(t.sales) })),
    keywords: kws.map((k) => ({ text: k.keyword_text, matchType: k.match_type, state: k.state })),
    negatives: negs.map((n) => ({ text: n.keyword_text, matchType: n.match_type })),
    ranks: Object.fromEntries(Object.entries(myRanks).map(([k, hs]) => [normTerm(k), hs.at(-1)!])),
    tracked: ((tracked.data ?? []) as { keyword: string }[]).map((t) => t.keyword),
  });
  const counts = { poe: 0, harvested: 0, ngram: 0, rank: 0, manual: 0 } as Record<BankSource, number>;
  for (const r of rows) for (const s of r.sources) counts[s]++;
  return { asin: a, rows, counts, candidate, headTerms: headTermsFromBank(rows) };
}

export async function addBankTerms(asin: string, texts: string[], note?: string | null) {
  const a = asin.toUpperCase();
  if (!isAsin(a)) throw new Error("An ASIN is 10 letters and digits");
  const rows = parseList(texts).map((t) => ({ asin: a, text: t, norm: normTerm(t), source: "manual", note: note ?? null }));
  if (rows.length) must(await db().from("ads_keyword_bank").upsert(rows, { onConflict: "asin,norm", ignoreDuplicates: true }), "add to the keyword bank");
  return { added: rows.length };
}

export async function removeBankTerm(asin: string, norm: string) {
  must(await db().from("ads_keyword_bank").delete().eq("asin", asin.toUpperCase()).eq("norm", normTerm(norm)), "remove from the keyword bank");
}

/* ===================== bank actions: queued as approved proposals ===================== */

const gbp = (v: number) => `£${v.toFixed(2)}`;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

async function queue(p: { rule: "harvest" | "negative"; key: string; asin: string; campaign: { id: string; name: string; state: string | null; campaign_id: string | null } | null; label: string; current: string; proposed: string; reason: string; effect: string; changes: BulkChange[]; clicks: number; orders: number }) {
  const d = db();
  const dup = must(await d.from("ads_proposals").select("id").eq("rule", p.rule).eq("entity_key", p.key).in("status", ["open", "approved", "exported"]), "existing") as unknown[];
  if (dup.length) return false;
  must(await d.from("ads_proposals").insert({
    rule: p.rule, entity_key: p.key, status: "approved", asin: p.asin, campaign: p.campaign?.id ?? null, campaign_name: p.campaign?.name ?? null, campaign_state: p.campaign?.state ?? null,
    entity: { type: "search term", label: p.label, campaignId: p.campaign?.campaign_id ?? null, adGroupId: null, keywordId: null, targetId: null },
    current_value: p.current, proposed_value: p.proposed, reason: p.reason, confidence: "medium", effect: p.effect, changes: p.changes, grp: "keyword bank",
    clicks: p.clicks, orders: p.orders, decided_at: now(), updated_at: now(),
  }), "queue proposal");
  return true;
}

/**
 * Keyword bank actions: "Add as exact" (into the product's Exact campaign at the bid for the target
 * at the term's smoothed conversion), "Add as negative" (negative exact in its broad and auto
 * campaigns) and "Track rank". The first two are queued as approved proposals: they go out with the
 * next bulk sheet from Proposals.
 */
export async function bankAction(asin: string, action: "exact" | "negative" | "track", texts: string[]) {
  const a = asin.toUpperCase();
  const terms = parseList(texts);
  if (!terms.length) throw new Error("Pick a term");
  if (action === "track") {
    for (const t of terms) await setRankKeyword(a, t, true);
    return { done: terms.length, skipped: [] as string[] };
  }
  const [dash, all, settings] = await Promise.all([adsDashboard(), loadAll(), adsSettings()]);
  const product = dash.asins.find((x) => x.asin === a);
  if (!product) throw new Error(`${a} has no ad campaigns yet: launch it on Ads → Launch first`);
  const camps = all.campaigns.filter((c) => c.asin === a && !/archived/i.test(c.state ?? ""));
  const campIds = camps.map((c) => c.id);
  const kws = campIds.length ? await selectAll<{ campaign: string; ad_group_id: string; keyword_text: string; match_type: string; state: string | null }>("ads_keywords", "campaign, ad_group_id, keyword_text, match_type, state", ["keyword_id"], (q) => q.in("campaign", campIds)) : [];
  const negs = campIds.length ? await selectAll<{ campaign: string; keyword_text: string; match_type: string }>("ads_negative_keywords", "campaign, keyword_text, match_type", ["keyword_id"], (q) => q.in("campaign", campIds)) : [];
  const kwIn = (cid: string) => kws.filter((k) => k.campaign === cid && !/archived/i.test(k.state ?? ""));
  const skipped: string[] = [];
  let done = 0;
  if (action === "exact") {
    const exact = camps.filter((c) => !/auto/i.test(c.targeting ?? "") && kwIn(c.id).length && kwIn(c.id).every((k) => /^exact$/i.test(k.match_type))).sort((x, y) => kwIn(y.id).length - kwIn(x.id).length)[0];
    if (!exact?.campaign_id) throw new Error(`${a} has no Exact campaign with an Amazon ID to add to: harvest or launch one first`);
    const group = kwIn(exact.id)[0].ad_group_id;
    const price = product.economics.price;
    const k = settings.smoothingK;
    const prior = priorConversion({ clicks: product.totals.clicks, orders: product.totals.orders }, null, k);
    for (const t of terms) {
      if (bankStatus(t, kwIn(exact.id).map((x) => ({ text: x.keyword_text, matchType: x.match_type, state: x.state })), []) === "targeted exact") { skipped.push(`"${t}" is already exact`); continue; }
      const st = (all.terms as Record<string, unknown>[]).filter((x) => normTerm(x.term as string) === t && camps.some((c) => c.id === x.campaign)).reduce<{ clicks: number; orders: number }>((s, x) => ({ clicks: s.clicks + Number(x.clicks), orders: s.orders + Number(x.orders) }), { clicks: 0, orders: 0 });
      const conv = smoothedConversion(st.orders, st.clicks, prior.value, k);
      const bid = Math.max(0.1, Math.round(product.targetAcos * price * conv * 100) / 100);
      const ok = await queue({
        rule: "harvest", key: `bank:exact:${a}:${t}`, asin: a, campaign: exact, label: t, current: "not targeted exact", proposed: `exact in ${exact.name} at ${gbp(bid)}`,
        reason: `Added from the keyword bank. Bid ${gbp(bid)} = the ${pct(product.targetAcos)} target × ${gbp(price)} × ${(conv * 100).toFixed(1)}% smoothed conversion (${conversionTxt(st.orders, st.clicks, conv, prior)}).`,
        effect: "The term gets its own exact bid", changes: [{ kind: "create_keyword", campaignId: exact.campaign_id, adGroupId: group, text: t, matchType: "Exact", bid }],
        clicks: st.clicks, orders: st.orders,
      });
      if (ok) done++; else skipped.push(`"${t}" is already queued`);
    }
  } else {
    const broad = camps.filter((c) => c.campaign_id && (/auto/i.test(c.targeting ?? "") || kwIn(c.id).some((k) => !/^exact$/i.test(k.match_type))));
    if (!broad.length) throw new Error(`${a} has no broad or auto campaign to add negatives to`);
    for (const t of terms) {
      const changes: BulkChange[] = [];
      for (const c of broad) if (!negs.some((n) => n.campaign === c.id && /exact/i.test(n.match_type) && normTerm(n.keyword_text) === t)) changes.push({ kind: "create_negative", campaignId: c.campaign_id!, adGroupId: null, text: t, matchType: "Negative exact" });
      if (!changes.length) { skipped.push(`"${t}" is already negatived`); continue; }
      const ok = await queue({
        rule: "negative", key: `bank:negative:${a}:${t}`, asin: a, campaign: broad[0], label: t, current: "showing", proposed: `negative exact in ${changes.length} campaign${changes.length === 1 ? "" : "s"}`,
        reason: `Added from the keyword bank: "${t}" as a campaign-level negative exact in ${broad.filter((c) => changes.some((x) => x.kind === "create_negative" && x.campaignId === c.campaign_id)).map((c) => c.name).join(", ")}.`,
        effect: "No more clicks bought on this search", changes, clicks: 0, orders: 0,
      });
      if (ok) done++; else skipped.push(`"${t}" is already queued`);
    }
  }
  return { done, skipped };
}
