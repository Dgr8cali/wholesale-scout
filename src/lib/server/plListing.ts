import "server-only";
import {
  DEFAULT_BRAND_VOICE, DEFAULT_TITLE_LIMIT, LISTING_FIELDS, complianceFlags, keywordCoverage, leadTerm, normaliseDraft, ruleIssues,
  type ListingDraft, type ListingField,
} from "../pl/listing";
import {
  enforceRules, listingChecks, needsProof, parseList, parseSpecs, requiredThemes, ruleContext, rulesPrompt,
  type ListingCheck,
} from "../pl/listingRules";
import { markOf, mineThemes, reviewsOf, type ReviewSummary } from "../pl/reviews";
import { askModel, latestAi } from "./adsAi";
import { db, must } from "./db";
import { brandTerms } from "./plNiches";
import { reviewData } from "./plReviews";

/** What a listing is written from: the candidate, Gate 4's themes, Gates 3/5's search terms, the keyword bank. */
export interface ListingInputs {
  product: string; name: string; nicheKeyword: string | null;
  sellPrice: number | null; spec: string | null; notes: string | null; packSize: string | null; unit: string | null; sixWords: string | null;
  brandVoice: string; titleLimit: number;
  /** The Listing section's facts: brand (the title starts with it), key specs, uses, claims never to state. */
  brand: string; specs: string[]; suitableFor: string[]; notFor: string[]; avoid: string[];
  themes: { theme: string; pct: number; reviews: number }[];
  chosenTheme: string | null;
  summary: string[];
  searchTerms: { term: string; volume: number | null; conversion: number | null }[];
  bankTerms: string[];
  /** Competitor brands to keep out: Settings → Private label's brand list and the page-one ASINs' brands. */
  brands: string[];
  leadTerm: string | null;
}

export interface ListingSettings {
  brandVoice: string; packSize: string | null; titleLimit: number;
  /** Required: the title starts with it. */
  brand: string;
  /** One fact per line (prefilled from the candidate's specs until saved). */
  specs: string;
  /** Comma lists. */
  suitableFor: string; notFor: string;
  /** Free text, added to the compliance list. */
  avoid: string;
}

export interface DraftRow { id: string; version: number; source: string; inputs: Partial<ListingInputs>; outputs: ListingDraft; created_at: string }

const now = () => new Date().toISOString();

type SettingsRow = {
  listing_voice: string | null; listing_pack: string | null; listing_title_limit: number | null;
  listing_brand: string | null; listing_specs: string | null; listing_suitable: string | null; listing_not_for: string | null; listing_avoid: string | null;
};

/**
 * The candidate's listing settings: brand voice (default "premium, clean, simple, no hype"), pack
 * size, title limit, and the facts (brand, key specs, suitable for / not for, claims to avoid). Key
 * specs start from the candidate's own specs (Gate 7's spec field) until you save them here.
 */
export async function listingSettings(candidateId: string): Promise<ListingSettings> {
  const c = must(await db().from("pl_candidates").select("listing_voice, listing_pack, listing_title_limit, listing_brand, listing_specs, listing_suitable, listing_not_for, listing_avoid").eq("id", candidateId).single(), "candidate") as SettingsRow;
  const spec = c.listing_specs == null
    ? ((must(await db().from("pl_candidate_fields").select("value").eq("candidate_id", candidateId).eq("key", "spec"), "spec") as { value: string }[])[0]?.value ?? "")
    : c.listing_specs;
  return {
    brandVoice: c.listing_voice?.trim() || DEFAULT_BRAND_VOICE, packSize: c.listing_pack ?? null, titleLimit: c.listing_title_limit ?? DEFAULT_TITLE_LIMIT,
    brand: c.listing_brand ?? "", specs: parseSpecs(spec).join("\n"), suitableFor: c.listing_suitable ?? "", notFor: c.listing_not_for ?? "", avoid: c.listing_avoid ?? "",
  };
}

export async function saveListingSettings(candidateId: string, s: Partial<ListingSettings>): Promise<ListingSettings> {
  const upd: Record<string, unknown> = { updated_at: now() };
  if (s.brandVoice !== undefined) upd.listing_voice = s.brandVoice?.trim() || null;
  if (s.packSize !== undefined) upd.listing_pack = s.packSize?.trim() || null;
  if (s.brand !== undefined) upd.listing_brand = s.brand?.trim() || null;
  if (s.specs !== undefined) upd.listing_specs = parseSpecs(s.specs).join("\n");
  if (s.suitableFor !== undefined) upd.listing_suitable = s.suitableFor?.trim() || null;
  if (s.notFor !== undefined) upd.listing_not_for = s.notFor?.trim() || null;
  if (s.avoid !== undefined) upd.listing_avoid = s.avoid?.trim() || null;
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
  const mined = mineThemes(reviewsOf(rd.dumps), rd.synonyms).themes.filter((t) => markOf(rd.marks, t) !== "ignore" && markOf(rd.marks, t) !== "not fixable");
  // Marks are saved under the theme's key ("clean glass"); the listing gets its wording ("clean glasses").
  const chosenKey = Object.entries(rd.marks).find(([, m]) => m === "chosen")?.[0] ?? null;
  const chosenTheme = chosenKey == null ? null : mined.find((t) => t.key === chosenKey || t.theme === chosenKey)?.theme ?? chosenKey;
  const summary = ((await latestAi("pl_reviews", candidateId))?.result as ReviewSummary | undefined)?.complaints?.map((x) => x.sentence) ?? [];

  // Gates 3 and 5: the attached Opportunity Explorer capture's search terms.
  const poe = (must(await d.from("pl_poe_snapshots").select("search_terms").eq("candidate_id", candidateId).order("captured_at", { ascending: false }).limit(1), "capture") as { search_terms: { term: string; volume?: number | null; conversion?: number | null }[] | null }[])[0];
  const searchTerms = (poe?.search_terms ?? []).filter((t) => t.term).map((t) => ({ term: t.term, volume: t.volume ?? null, conversion: t.conversion ?? null }));

  // The keyword bank of the candidate's Ads product, when it has one.
  const ads = must(await d.from("ads_products").select("asin").eq("pl_candidate_id", candidateId), "ads products") as { asin: string }[];
  const bankTerms = ads.length
    ? [...new Set((must(await d.from("ads_keyword_bank").select("text").in("asin", ads.map((a) => a.asin)), "keyword bank") as { text: string }[]).map((k) => k.text.trim().toLowerCase()).filter(Boolean))].slice(0, 100)
    : [];

  // Competitor brands: Settings → Private label's list, plus the brands of the candidate's page-one ASINs.
  const pageOne = (must(await d.from("pl_candidate_asins").select("brand").eq("candidate_id", candidateId), "page-one brands") as { brand: string | null }[])
    .map((a) => a.brand?.trim().toLowerCase() ?? "").filter((b) => b && !/^(generic|unbranded|no brand|unknown)$/.test(b) && b !== settings.brand.trim().toLowerCase());
  const brands = [...new Set([...(await brandTerms()), ...pageOne])];

  const product = c.niche_keyword?.trim() || c.name;
  return {
    product, name: c.name, nicheKeyword: c.niche_keyword,
    sellPrice: fields.sell ? Number(fields.sell) : null, spec: fields.spec ?? null, notes: c.notes, packSize: settings.packSize, unit: fields.productUnit ?? null,
    sixWords: fields.sixWordsText ?? null, brandVoice: settings.brandVoice, titleLimit: settings.titleLimit,
    brand: settings.brand.trim(), specs: parseSpecs(settings.specs), suitableFor: parseList(settings.suitableFor), notFor: parseList(settings.notFor), avoid: parseList(settings.avoid),
    themes: mined.slice(0, 10).map((t) => ({ theme: t.theme, pct: Math.round(t.pct * 10) / 10, reviews: t.reviews })),
    chosenTheme, summary,
    searchTerms: searchTerms.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 40),
    bankTerms, brands,
    leadTerm: leadTerm(searchTerms, product),
  };
}

const LISTING_SYSTEM = `You write Amazon UK product listings for a small private-label seller. British English, in the brand voice given. The first draft goes live without editing, so every rule in the instruction is a hard rule: count characters and bytes.
- Use only the facts given (brand, key specs, pack size, suitable for, not for). Never invent a spec, a number, a certification or a test result.
- Answer the review complaints given with the key specs as the evidence ("70% isopropyl alcohol dries in seconds" answers "too wet").
- Never make biocidal, medical or unproven green claims, never name a competitor brand, never use a claim on the "claims to avoid" list, not even negated ("not plastic-free").
- Differentiation angle: 2–3 sentences tying the top complaints to how this product is better.`;

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The product title: brand first, Title Case" },
    bullets: { type: "array", items: { type: "string" }, description: "Exactly five bullet points, each \"HEADER IN CAPITALS: …\", 150–250 characters" },
    description: { type: "string", description: "Three short paragraphs separated by a blank line" },
    backend: { type: "string", description: "Backend search terms, lowercase, space-separated, 200–249 bytes" },
    differentiation: { type: "string", description: "2–3 sentences: the complaint themes and how this product is better" },
  },
} as const;
const fieldSchema = (f: ListingField) => ({ type: "object", properties: { [f]: (DRAFT_SCHEMA.properties as Record<string, unknown>)[f] } });

/** What the model is sent: the inputs, trimmed of what it doesn't need. */
const contextOf = (i: ListingInputs) => ({
  product: i.product, candidateName: i.name, brand: i.brand, keySpecs: i.specs, suitableFor: i.suitableFor, notFor: i.notFor, claimsToAvoid: i.avoid,
  sellPrice: i.sellPrice, notes: i.notes, packSize: i.packSize, unit: i.unit,
  differentiator: i.sixWords, brandVoice: i.brandVoice, titleLimit: i.titleLimit, leadSearchTerm: i.leadTerm,
  reviewComplaintThemes: i.themes, chosenTheme: i.chosenTheme, complaintsToAnswer: requiredThemes(ruleContext(i)), reviewSummary: i.summary,
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

/** The checks on a draft: the editor's rule notes, compliance (with the claims to avoid), coverage, the Checks list and the needs-proof sentences. */
export function checksOf(d: ListingDraft, i: ListingInputs) {
  const compliance = complianceFlags(d, { brands: i.brands, notes: i.notes, avoid: i.avoid });
  return {
    issues: ruleIssues(d, { titleLimit: i.titleLimit, leadTerm: i.leadTerm, themes: i.themes.slice(0, 6).map((t) => t.theme) }),
    compliance,
    coverage: keywordCoverage(d, i.searchTerms),
    list: listingChecks(d, ruleContext(i), compliance.map((c) => c.term)),
    proof: needsProof(d),
  };
}

const failuresOf = (list: ListingCheck[]) => list.filter((c) => !c.pass).map((c) => ({ rule: c.label, problem: c.detail ?? "failed" }));

/**
 * Write the listing (on your click only): one model call, cached by its inputs (the same inputs
 * give the stored answer unless `force`), logged with its tokens and cost. Saved as a new version.
 */
export async function generateListing(candidateId: string, opts: { force?: boolean } = {}) {
  const inputs = await listingInputs(candidateId);
  if (!inputs.brand) throw new Error("Set the brand name first: the title starts with it");
  if (!inputs.themes.length && !inputs.searchTerms.length) throw new Error("Nothing to write from yet: mine some reviews in Gate 4 or attach an Opportunity Explorer capture first");
  const rc = ruleContext(inputs);
  const run = await askModel<Partial<ListingDraft>>({
    feature: "pl_listing", subject: candidateId, context: contextOf(inputs), force: opts.force, maxTokens: 4000, system: LISTING_SYSTEM,
    tool: { name: "listing", description: "The Amazon listing", input_schema: DRAFT_SCHEMA as never },
    instruction: `Write the listing for "${inputs.product}". Hard rules:\n${rulesPrompt(rc)}`,
  });
  const first = enforceRules(normaliseDraft(run.result, inputs.brands), rc);
  const firstChecks = checksOf(first.draft, inputs);
  const failures = failuresOf(firstChecks.list);
  const calls = [run];
  let final = first, fixes = first.fixes;
  // One repair call, with only what failed and the draft as it stands; the code fixes again after it.
  if (failures.length) {
    const repair = await askModel<Partial<ListingDraft>>({
      feature: "pl_listing", subject: `${candidateId}:repair`, force: opts.force, maxTokens: 4000, system: LISTING_SYSTEM,
      context: { draft: first.draft, failedRules: failures, facts: { brand: inputs.brand, keySpecs: inputs.specs, suitableFor: inputs.suitableFor, notFor: inputs.notFor, claimsToAvoid: inputs.avoid, packSize: inputs.packSize, leadSearchTerm: inputs.leadTerm, complaintsToAnswer: requiredThemes(rc), chosenTheme: inputs.chosenTheme }, competitorBrandsToAvoid: inputs.brands.slice(0, 200) },
      tool: { name: "listing", description: "The repaired Amazon listing", input_schema: DRAFT_SCHEMA as never },
      instruction: `Repair this listing so every failed rule passes. Change only what's needed for those rules, keep everything else as it is, and return the whole listing. All the rules:\n${rulesPrompt(rc)}`,
    });
    calls.push(repair);
    final = enforceRules(normaliseDraft({ ...first.draft, ...stripEmpty(repair.result) }, inputs.brands), rc);
    fixes = [...first.fixes, ...final.fixes];
  }
  const checks = checksOf(final.draft, inputs);
  const cached = calls.every((c) => c.cached);
  const source = `${run.cached ? "generated (cached)" : "generated"}${calls.length > 1 ? " + repaired" : ""}`;
  const row = await saveVersion(candidateId, source, { ...inputs, run: { fixes, failedBeforeRepair: failures } } as Partial<ListingInputs>, final.draft);
  return {
    draft: row, checks, fixes, failedBeforeRepair: failures,
    call: {
      cached, model: run.model, calls: calls.length,
      costGbp: calls.reduce((a, c) => a + (c.cached ? 0 : c.costGbp), 0),
      tokens: calls.reduce((a, c) => (c.cached ? a : { input: a.input + c.tokens.input, output: a.output + c.tokens.output }), { input: 0, output: 0 }),
    },
  };
}

/** A model answer without its empty fields (a repair that drops a field keeps the draft's). */
function stripEmpty(x: Partial<ListingDraft> | null | undefined): Partial<ListingDraft> {
  const out: Partial<ListingDraft> = {};
  for (const [k, v] of Object.entries(x ?? {})) if (Array.isArray(v) ? v.some((b) => typeof b === "string" && b.trim()) : typeof v === "string" && v.trim()) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Write one field again (the rest kept), as a new version. */
export async function regenerateField(candidateId: string, field: ListingField, current: ListingDraft, opts: { force?: boolean } = {}) {
  if (!LISTING_FIELDS.includes(field)) throw new Error(`field: ${LISTING_FIELDS.join(", ")}`);
  const inputs = await listingInputs(candidateId);
  const run = await askModel<Partial<ListingDraft>>({
    feature: "pl_listing", subject: `${candidateId}:${field}`, context: { ...contextOf(inputs), currentListing: current }, force: opts.force ?? true, maxTokens: 2500, system: LISTING_SYSTEM,
    tool: { name: `listing_${field}`, description: `The listing's ${field}`, input_schema: fieldSchema(field) as never },
    instruction: `Rewrite only the ${field} of the current listing, better, keeping to these rules; leave everything else as it is.\n${rulesPrompt(ruleContext(inputs))}`,
  });
  const merged = enforceRules(normaliseDraft({ ...current, [field]: (run.result as Record<string, unknown>)[field] ?? current[field] } as Partial<ListingDraft>, inputs.brands), ruleContext(inputs)).draft;
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
