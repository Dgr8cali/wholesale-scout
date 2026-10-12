import "server-only";
import {
  DEFAULT_BRAND_VOICE, DEFAULT_TITLE_LIMIT, LISTING_FIELDS, complianceFlags, keywordCoverage, leadTerm, normaliseDraft, ruleIssues,
  type ListingDraft, type ListingField,
} from "../pl/listing";
import { mineThemes, reviewsOf, type ReviewSummary } from "../pl/reviews";
import { askModel, latestAi } from "./adsAi";
import { db, must } from "./db";
import { brandTerms } from "./plNiches";
import { reviewData } from "./plReviews";

/** What a listing is written from: the candidate, Gate 4's themes, Gates 3/5's search terms, the keyword bank. */
export interface ListingInputs {
  product: string; name: string; nicheKeyword: string | null;
  sellPrice: number | null; spec: string | null; notes: string | null; packSize: string | null; unit: string | null; sixWords: string | null;
  brandVoice: string; titleLimit: number;
  themes: { theme: string; pct: number; reviews: number }[];
  chosenTheme: string | null;
  summary: string[];
  searchTerms: { term: string; volume: number | null; conversion: number | null }[];
  bankTerms: string[];
  /** Competitor brands to keep out (Settings → Private label's brand list). */
  brands: string[];
  leadTerm: string | null;
}

export interface ListingSettings { brandVoice: string; packSize: string | null; titleLimit: number }

export interface DraftRow { id: string; version: number; source: string; inputs: Partial<ListingInputs>; outputs: ListingDraft; created_at: string }

const now = () => new Date().toISOString();

/** The candidate's listing settings: its brand voice (default "premium, clean, simple, no hype"), pack size and title limit. */
export async function listingSettings(candidateId: string): Promise<ListingSettings> {
  const c = must(await db().from("pl_candidates").select("listing_voice, listing_pack, listing_title_limit").eq("id", candidateId).single(), "candidate") as { listing_voice: string | null; listing_pack: string | null; listing_title_limit: number | null };
  return { brandVoice: c.listing_voice?.trim() || DEFAULT_BRAND_VOICE, packSize: c.listing_pack ?? null, titleLimit: c.listing_title_limit ?? DEFAULT_TITLE_LIMIT };
}

export async function saveListingSettings(candidateId: string, s: Partial<ListingSettings>): Promise<ListingSettings> {
  const upd: Record<string, unknown> = { updated_at: now() };
  if (s.brandVoice !== undefined) upd.listing_voice = s.brandVoice?.trim() || null;
  if (s.packSize !== undefined) upd.listing_pack = s.packSize?.trim() || null;
  if (s.titleLimit !== undefined) {
    const n = Math.round(Number(s.titleLimit));
    if (!(n >= 50 && n <= 500)) throw new Error("Title limit: 50 to 500 characters");
    upd.listing_title_limit = n;
  }
  must(await db().from("pl_candidates").update(upd).eq("id", candidateId), "listing settings");
  return listingSettings(candidateId);
}

/** Everything the listing is written from, gathered from what's stored (no capture, no API call). */
export async function listingInputs(candidateId: string): Promise<ListingInputs> {
  const d = db();
  const c = must(await d.from("pl_candidates").select("name, niche_keyword, notes").eq("id", candidateId).single(), "candidate") as { name: string; niche_keyword: string | null; notes: string | null };
  const fields = Object.fromEntries((must(await d.from("pl_candidate_fields").select("key, value").eq("candidate_id", candidateId).in("key", ["sell", "spec", "sixWordsText", "productUnit"]), "fields") as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const settings = await listingSettings(candidateId);

  // Gate 4: the themes (fixable ones, by share), the one picked, and the summary if there is one.
  const rd = await reviewData(candidateId);
  const mined = mineThemes(reviewsOf(rd.dumps), rd.synonyms).themes.filter((t) => rd.marks[t.theme] !== "ignore" && rd.marks[t.theme] !== "not fixable");
  const chosenTheme = Object.entries(rd.marks).find(([, m]) => m === "chosen")?.[0] ?? null;
  const summary = ((await latestAi("pl_reviews", candidateId))?.result as ReviewSummary | undefined)?.complaints?.map((x) => x.sentence) ?? [];

  // Gates 3 and 5: the attached Opportunity Explorer capture's search terms.
  const poe = (must(await d.from("pl_poe_snapshots").select("search_terms").eq("candidate_id", candidateId).order("captured_at", { ascending: false }).limit(1), "capture") as { search_terms: { term: string; volume?: number | null; conversion?: number | null }[] | null }[])[0];
  const searchTerms = (poe?.search_terms ?? []).filter((t) => t.term).map((t) => ({ term: t.term, volume: t.volume ?? null, conversion: t.conversion ?? null }));

  // The keyword bank of the candidate's Ads product, when it has one.
  const ads = must(await d.from("ads_products").select("asin").eq("pl_candidate_id", candidateId), "ads products") as { asin: string }[];
  const bankTerms = ads.length
    ? [...new Set((must(await d.from("ads_keyword_bank").select("text").in("asin", ads.map((a) => a.asin)), "keyword bank") as { text: string }[]).map((k) => k.text.trim().toLowerCase()).filter(Boolean))].slice(0, 100)
    : [];

  const product = c.niche_keyword?.trim() || c.name;
  return {
    product, name: c.name, nicheKeyword: c.niche_keyword,
    sellPrice: fields.sell ? Number(fields.sell) : null, spec: fields.spec ?? null, notes: c.notes, packSize: settings.packSize, unit: fields.productUnit ?? null,
    sixWords: fields.sixWordsText ?? null, brandVoice: settings.brandVoice, titleLimit: settings.titleLimit,
    themes: mined.slice(0, 10).map((t) => ({ theme: t.theme, pct: Math.round(t.pct * 10) / 10, reviews: t.reviews })),
    chosenTheme, summary,
    searchTerms: searchTerms.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 40),
    bankTerms, brands: await brandTerms(),
    leadTerm: leadTerm(searchTerms, product),
  };
}

const LISTING_SYSTEM = `You write Amazon UK product listings for a small private-label seller. British English. Follow Amazon's style rules strictly:
- Title: lead with the lead search term given; product, key feature, size or count; at most the title limit in characters. No ALL CAPS words, no promotional words (best, #1, free, sale, guaranteed), no prices, no competitor brands.
- Five bullets: each opens with a short capitalised benefit then a colon ("Leak-proof lid: …"), one benefit each, at most 500 characters. At least three answer one of the review complaint themes given, saying how this product avoids it.
- Description: plain prose, 2–4 short paragraphs, no HTML, no claims you can't back up.
- Backend search terms: lowercase words separated by single spaces, at most 249 bytes, no words already in the title, no competitor brands, no ASINs, no punctuation; synonyms, misspellings and other search terms shoppers use.
- Differentiation angle: 2–3 sentences tying the top complaint themes to how this product is better.
Never make biocidal, medical or unproven green claims (antibacterial, kills 99.9%, disinfects, sterile, medical grade, FDA, cures, eco-friendly, biodegradable, plastic-free) unless the notes say it's certified. Keep to the brand voice given.`;

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The product title" },
    bullets: { type: "array", items: { type: "string" }, description: "Exactly five bullet points" },
    description: { type: "string" },
    backend: { type: "string", description: "Backend search terms, lowercase, space-separated, ≤ 249 bytes" },
    differentiation: { type: "string", description: "2–3 sentences: the complaint themes and how this product is better" },
  },
} as const;
const fieldSchema = (f: ListingField) => ({ type: "object", properties: { [f]: (DRAFT_SCHEMA.properties as Record<string, unknown>)[f] } });

/** What the model is sent: the inputs, trimmed of what it doesn't need. */
const contextOf = (i: ListingInputs) => ({
  product: i.product, candidateName: i.name, sellPrice: i.sellPrice, spec: i.spec, notes: i.notes, packSize: i.packSize, unit: i.unit,
  differentiator: i.sixWords, brandVoice: i.brandVoice, titleLimit: i.titleLimit, leadSearchTerm: i.leadTerm,
  reviewComplaintThemes: i.themes, chosenTheme: i.chosenTheme, reviewSummary: i.summary,
  searchTerms: i.searchTerms, keywordBank: i.bankTerms, competitorBrandsToAvoid: i.brands.slice(0, 200),
});

async function nextVersion(candidateId: string): Promise<number> {
  const last = (must(await db().from("pl_listing_drafts").select("version").eq("candidate_id", candidateId).order("version", { ascending: false }).limit(1), "versions") as { version: number }[])[0];
  return (last?.version ?? 0) + 1;
}

async function saveVersion(candidateId: string, source: string, inputs: Partial<ListingInputs>, outputs: ListingDraft): Promise<DraftRow> {
  const version = await nextVersion(candidateId);
  return must(await db().from("pl_listing_drafts").insert({ candidate_id: candidateId, version, source, inputs, outputs }).select("id, version, source, inputs, outputs, created_at").single(), "save listing") as DraftRow;
}

/** The checks on a draft: the rules, the compliance flags, keyword coverage. */
export function checksOf(d: ListingDraft, i: Pick<ListingInputs, "titleLimit" | "leadTerm" | "themes" | "brands" | "notes" | "searchTerms">) {
  return {
    issues: ruleIssues(d, { titleLimit: i.titleLimit, leadTerm: i.leadTerm, themes: i.themes.slice(0, 6).map((t) => t.theme) }),
    compliance: complianceFlags(d, { brands: i.brands, notes: i.notes }),
    coverage: keywordCoverage(d, i.searchTerms),
  };
}

/**
 * Write the listing (on your click only): one model call, cached by its inputs (the same inputs
 * give the stored answer unless `force`), logged with its tokens and cost. Saved as a new version.
 */
export async function generateListing(candidateId: string, opts: { force?: boolean } = {}) {
  const inputs = await listingInputs(candidateId);
  if (!inputs.themes.length && !inputs.searchTerms.length) throw new Error("Nothing to write from yet: mine some reviews in Gate 4 or attach an Opportunity Explorer capture first");
  const run = await askModel<Partial<ListingDraft>>({
    feature: "pl_listing", subject: candidateId, context: contextOf(inputs), force: opts.force, maxTokens: 4000, system: LISTING_SYSTEM,
    tool: { name: "listing", description: "The Amazon listing", input_schema: DRAFT_SCHEMA as never },
    instruction: `Write the listing for "${inputs.product}". Lead the title with "${inputs.leadTerm ?? inputs.product}". Title at most ${inputs.titleLimit} characters.`,
  });
  const draft = normaliseDraft(run.result, inputs.brands);
  const row = await saveVersion(candidateId, run.cached ? "generated (cached)" : "generated", inputs, draft);
  return { draft: row, checks: checksOf(draft, inputs), call: { cached: run.cached, costGbp: run.costGbp, tokens: run.tokens, model: run.model } };
}

/** Write one field again (the rest kept), as a new version. */
export async function regenerateField(candidateId: string, field: ListingField, current: ListingDraft, opts: { force?: boolean } = {}) {
  if (!LISTING_FIELDS.includes(field)) throw new Error(`field: ${LISTING_FIELDS.join(", ")}`);
  const inputs = await listingInputs(candidateId);
  const run = await askModel<Partial<ListingDraft>>({
    feature: "pl_listing", subject: `${candidateId}:${field}`, context: { ...contextOf(inputs), currentListing: current }, force: opts.force ?? true, maxTokens: 2500, system: LISTING_SYSTEM,
    tool: { name: `listing_${field}`, description: `The listing's ${field}`, input_schema: fieldSchema(field) as never },
    instruction: `Rewrite only the ${field} of the current listing, better, keeping to the rules; leave everything else as it is.`,
  });
  const merged = normaliseDraft({ ...current, [field]: (run.result as Record<string, unknown>)[field] ?? current[field] } as Partial<ListingDraft>, inputs.brands);
  // Only the field asked for changes (the backend is cleaned against the title either way).
  const draft: ListingDraft = { ...current, [field]: merged[field], backend: field === "title" || field === "backend" ? merged.backend : current.backend };
  const row = await saveVersion(candidateId, `regenerated ${field}`, inputs, draft);
  return { draft: row, checks: checksOf(draft, inputs), call: { cached: run.cached, costGbp: run.costGbp, tokens: run.tokens, model: run.model } };
}

/** Your edit, as a new version (kept as typed: the checks say what's over). */
export async function saveListingEdit(candidateId: string, draft: Partial<ListingDraft>) {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const bullets = Array.isArray(draft.bullets) ? draft.bullets.map(s) : [];
  while (bullets.length < 5) bullets.push("");
  const d: ListingDraft = { title: s(draft.title), bullets: bullets.slice(0, 5), description: s(draft.description), backend: s(draft.backend), differentiation: s(draft.differentiation) };
  const inputs = await listingInputs(candidateId);
  const row = await saveVersion(candidateId, "edited", inputs, d);
  return { draft: row, checks: checksOf(d, inputs) };
}

/** An earlier version back, as a new version. */
export async function restoreListing(candidateId: string, version: number) {
  const old = must(await db().from("pl_listing_drafts").select("version, outputs").eq("candidate_id", candidateId).eq("version", version).maybeSingle(), "version") as { version: number; outputs: ListingDraft } | null;
  if (!old) throw new Error(`No version ${version}`);
  const inputs = await listingInputs(candidateId);
  const row = await saveVersion(candidateId, `restored v${old.version}`, inputs, old.outputs);
  return { draft: row, checks: checksOf(old.outputs, inputs) };
}

/** The Listing step: its inputs, settings, every version (newest first) and the latest's checks. */
export async function listingView(candidateId: string) {
  const inputs = await listingInputs(candidateId);
  const versions = must(await db().from("pl_listing_drafts").select("id, version, source, outputs, created_at").eq("candidate_id", candidateId).order("version", { ascending: false }).limit(50), "versions") as Omit<DraftRow, "inputs">[];
  const latest = versions[0] ?? null;
  return { inputs, settings: await listingSettings(candidateId), versions, latest, checks: latest ? checksOf(latest.outputs, inputs) : null };
}
