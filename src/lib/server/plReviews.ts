import "server-only";
import {
  buildReviewSummaryContext, DEFAULT_SYNONYMS, mineThemes, REVIEW_SUMMARY_SYSTEM, REVIEW_SUMMARY_TOOL, reviewsOf, splitPasteAll,
  type ReviewSummary, type SynonymGroup,
} from "../pl/reviews";
import { uncitedNumbers } from "../ads/ai";
import { askModel, latestAi } from "./adsAi";
import { db, must } from "./db";

export type ReviewMark = "chosen" | "not fixable" | "ignore";
export interface ReviewDump { asin: string; text: string; pasted_at: string }

const now = () => new Date().toISOString();
const isAsin = (s: unknown): s is string => typeof s === "string" && /^[A-Z0-9]{10}$/.test(s);

/** The synonym list: yours if edited (Gate 4 → Synonyms), else the defaults. */
export async function reviewSynonyms(): Promise<SynonymGroup[]> {
  const r = (await db().from("pl_review_settings").select("value").eq("key", "synonyms").maybeSingle()).data as { value: SynonymGroup[] } | null;
  return Array.isArray(r?.value) && r.value.length ? r.value : DEFAULT_SYNONYMS;
}

/** Validated: each group a theme, its word, and at least one term. Null resets to the defaults. */
export async function saveReviewSynonyms(groups: unknown): Promise<SynonymGroup[]> {
  if (groups === null) {
    must(await db().from("pl_review_settings").delete().eq("key", "synonyms"), "reset synonyms");
    return DEFAULT_SYNONYMS;
  }
  if (!Array.isArray(groups)) throw new Error("A list of synonym groups");
  const clean = groups.map((g) => {
    const x = g as Partial<SynonymGroup>;
    const theme = String(x.theme ?? "").trim().toLowerCase(), canon = String(x.canon ?? x.theme ?? "").trim().toLowerCase();
    const terms = [...new Set((Array.isArray(x.terms) ? x.terms : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
    if (!theme || !canon || !terms.length) throw new Error("Each group needs a theme, a word and at least one term");
    return { theme, canon, terms };
  });
  must(await db().from("pl_review_settings").upsert({ key: "synonyms", value: clean, updated_at: now() }, { onConflict: "key" }), "save synonyms");
  return clean;
}

export async function reviewData(candidateId: string) {
  const d = db();
  const [dumps, marks, synonyms] = await Promise.all([
    d.from("pl_review_dumps").select("asin, text, pasted_at").eq("candidate_id", candidateId).order("asin"),
    d.from("pl_review_marks").select("theme, mark").eq("candidate_id", candidateId),
    reviewSynonyms(),
  ]);
  return {
    dumps: must(dumps, "review dumps") as ReviewDump[],
    marks: Object.fromEntries((must(marks, "review marks") as { theme: string; mark: ReviewMark }[]).map((m) => [m.theme, m.mark])) as Record<string, ReviewMark>,
    synonyms,
    summary: await latestAi("pl_reviews", candidateId),
  };
}

/** One ASIN's pasted reviews (replacing the last paste); empty text removes it. */
export async function saveReviewDump(candidateId: string, asin: string, text: string) {
  const a = asin.trim().toUpperCase();
  if (!isAsin(a)) throw new Error("An ASIN (10 characters)");
  if (!text.trim()) {
    must(await db().from("pl_review_dumps").delete().eq("candidate_id", candidateId).eq("asin", a), "clear reviews");
    return;
  }
  if (text.length > 500_000) throw new Error("That paste is over 500,000 characters: paste fewer pages at a time");
  must(await db().from("pl_review_dumps").upsert({ candidate_id: candidateId, asin: a, text, pasted_at: now() }, { onConflict: "candidate_id,asin" }), "save reviews");
}

/** "Paste all": a section per "ASIN: B0…" line, each replacing that ASIN's paste. */
export async function savePasteAll(candidateId: string, text: string) {
  const { sections, ignored } = splitPasteAll(text);
  if (!sections.length) throw new Error("No \"ASIN: B0…\" lines found: start each listing's reviews with one");
  for (const s of sections) await saveReviewDump(candidateId, s.asin, s.text);
  return { asins: sections.map((s) => s.asin), ignoredChars: ignored };
}

/** Pick a theme for Gate 4 (one at a time), or mark it not fixable or to ignore; null clears. */
export async function setReviewMark(candidateId: string, theme: string, mark: ReviewMark | null) {
  const t = theme.trim();
  if (!t) throw new Error("theme required");
  const d = db();
  if (mark === "chosen") must(await d.from("pl_review_marks").delete().eq("candidate_id", candidateId).eq("mark", "chosen"), "clear chosen");
  if (!mark) must(await d.from("pl_review_marks").delete().eq("candidate_id", candidateId).eq("theme", t), "clear mark");
  else if (!["chosen", "not fixable", "ignore"].includes(mark)) throw new Error("mark: chosen, not fixable or ignore");
  else must(await d.from("pl_review_marks").upsert({ candidate_id: candidateId, theme: t, mark, updated_at: now() }, { onConflict: "candidate_id,theme" }), "save mark");
}

/** Everything the summary would send (no API call). */
export async function reviewSummaryContext(candidateId: string) {
  const cand = must(await db().from("pl_candidates").select("name, niche_keyword").eq("id", candidateId).single(), "candidate") as { name: string; niche_keyword: string | null };
  const { dumps, marks, synonyms } = await reviewData(candidateId);
  const reviews = reviewsOf(dumps);
  if (!reviews.length) throw new Error("Paste some reviews first");
  const themes = mineThemes(reviews, synonyms).themes.filter((t) => marks[t.theme] !== "ignore" && marks[t.theme] !== "not fixable");
  return buildReviewSummaryContext(cand.niche_keyword || cand.name, reviews, themes);
}

/** "Ask Claude to summarise": the top three fixable complaints, on your click only. */
export async function summariseReviews(candidateId: string, opts: { force?: boolean } = {}) {
  const context = await reviewSummaryContext(candidateId);
  const run = await askModel<ReviewSummary>({
    feature: "pl_reviews", subject: candidateId, context, force: opts.force, maxTokens: 3000, tool: REVIEW_SUMMARY_TOOL, system: REVIEW_SUMMARY_SYSTEM,
    instruction: "Name the top three complaints a factory could fix, commonest first, one sentence each, using the themes' shares.",
  });
  const result = { complaints: (run.result.complaints ?? []).slice(0, 3) };
  return { ...run, result, uncited: uncitedNumbers(result.complaints.map((c) => c.sentence).join(" "), context) };
}
