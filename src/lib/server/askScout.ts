import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { costOf, leanThinking, type Usage } from "../ads/ai";
import { aiClient, aiSettings, strictSchema } from "./adsAi";
import { TOOLS, runTool } from "./askScoutTools";
import { db, must } from "./db";

/**
 * Ask Scout: a question about your own data, answered by the model with the read-only tools in
 * askScoutTools.ts. The same client, model and pricing as the Listing Writer, thinking off (or the
 * least the model allows), at most 1,500 output tokens a request and 5 tool calls a question.
 * Each question is logged in ads_ai_calls (feature ask_scout) with its tokens and cost, and the last
 * 20 are kept in ask_scout_history.
 */

export const MAX_TOOL_CALLS = 5;
export const MAX_OUTPUT_TOKENS = 1500;
/** Kept for scrolling back. */
export const HISTORY = 20;

export interface AskAnswer {
  answer: string;
  /** The figures the answer used, each with the page it comes from. */
  figures: { label: string; value: string; href: string }[];
  links: { label: string; href: string }[];
  /** What it needed and couldn't find. */
  missing: string[];
}

export interface AskRun {
  id: string; question: string; created_at: string;
  answer: AskAnswer | null; error: string | null;
  tools: { name: string; input: Record<string, unknown> }[];
  model: string; input_tokens: number; output_tokens: number; cost_gbp: number;
}

const SYSTEM = `You are Scout, the assistant inside Wholesale Scout: a single UK Amazon seller's workbench (wholesale resale, private label, Sponsored Products ads, stock).
Answer the seller's question from their own data only, using the tools. The tools only read; you can't change anything. If asked to change something, say which page to do it on.
- Never guess or use outside knowledge for a figure. If the data needed isn't there, say plainly what's missing (for example "no ad data after 2 Oct", "no landed cost set") and put it in "missing".
- Look a product up with find_products when the question names it in words, then use its ASIN.
- Be short and plain: two to five sentences, British English, £, dates like 19 Oct. Lead with the answer ("Yes, …" / "No, …" / "Reorder by …"), then the numbers behind it.
- "Making money after ads" means profit after ads: sales minus Amazon fees, landed cost and ad spend.
- Put every figure you used in "figures" with a short label, the value as you'd say it ("£12.40", "34%") and the app page it came from (an href from the tool's links or data). Put the pages worth opening in "links" (hrefs from the tools only).
When you use a tool, you may say a brief sentence first. If no tool can express what the user asked for, say so instead of guessing. Do not include internal or system XML tags in your response.`;

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The answer in plain English, two to five sentences" },
    figures: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, href: { type: "string", description: "The app page it comes from, e.g. /ads/dashboard?asin=…" } } } },
    links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, href: { type: "string" } } } },
    missing: { type: "array", items: { type: "string" }, description: "Data that was needed and isn't there; empty when nothing was missing" },
  },
} as const;

/** Only the app's own pages: a link the tools gave, or one of the app's sections. */
const APP_PATH = /^\/(ads|stock|pl|products|suppliers|brands|runs|shortlist|new-run|plan|settings|help)(\/|\?|$)/;
export function cleanAnswer(raw: Partial<AskAnswer> | null, seen: Set<string>): AskAnswer {
  const ok = (h: unknown): h is string => typeof h === "string" && h.startsWith("/") && !h.startsWith("//") && (seen.has(h) || APP_PATH.test(h));
  return {
    answer: String(raw?.answer ?? "").trim() || "I couldn't put an answer together from your data.",
    figures: (raw?.figures ?? []).filter((f) => f && f.label && f.value).slice(0, 12).map((f) => ({ label: String(f.label), value: String(f.value), href: ok(f.href) ? f.href : "" })),
    links: (raw?.links ?? []).filter((l) => l && l.label && ok(l.href)).slice(0, 6).map((l) => ({ label: String(l.label), href: l.href })),
    missing: (raw?.missing ?? []).map(String).filter(Boolean).slice(0, 6),
  };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Every `href` inside a tool's data: the pages an answer may link to. */
function hrefsIn(x: unknown, into: Set<string>) {
  if (Array.isArray(x)) x.forEach((v) => hrefsIn(v, into));
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      if (k === "href" && typeof v === "string") into.add(v);
      else hrefsIn(v, into);
    }
  }
}

/** Ask one question. Throws only when it can't start (no key, empty question); a failed answer is saved with its error. */
export async function askScout(question: string, now = new Date()): Promise<AskRun> {
  const q = question.trim().slice(0, 500);
  if (!q) throw new Error("Type a question");
  const s = await aiSettings();
  if (!s.keySet) throw new Error("ANTHROPIC_API_KEY isn't set (.env.local and the server's .env)");
  const lean = leanThinking(s.model);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Today is ${now.toISOString().slice(0, 10)}.\n\nQuestion: ${q}` }];
  const tools: AskRun["tools"] = [];
  const seen = new Set<string>();
  const spent = { input: 0, output: 0, usd: 0, gbp: 0 };
  let answer: AskAnswer | null = null;
  let error: string | null = null;
  let nudged = false;

  try {
    // Each round: the model answers, or asks for tools. After 5 tool calls it must answer.
    for (let round = 0; round <= MAX_TOOL_CALLS + 1; round++) {
      const capped = tools.length >= MAX_TOOL_CALLS;
      const msg = await aiClient().messages.create({
        model: s.model, max_tokens: MAX_OUTPUT_TOKENS, system: SYSTEM, messages,
        tools: TOOLS, tool_choice: capped ? { type: "none" } : { type: "auto" },
        ...(lean.thinking ? { thinking: lean.thinking } : {}),
        output_config: { format: { type: "json_schema", schema: strictSchema(ANSWER_SCHEMA) }, ...(lean.effort ? { effort: lean.effort } : {}) },
      } as Anthropic.MessageCreateParamsNonStreaming);
      const use = msg.usage as Usage;
      const c = costOf(use, s, s.gbpPerUsd);
      spent.input += use.input_tokens; spent.output += use.output_tokens; spent.usd += c.usd; spent.gbp += c.gbp;

      if (msg.stop_reason === "tool_use") {
        const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        // The assistant turn goes back unchanged (thinking blocks included).
        messages.push({ role: "assistant", content: msg.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const call of calls) {
          if (tools.length >= MAX_TOOL_CALLS) {
            results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Limit of ${MAX_TOOL_CALLS} lookups reached: answer with what you have.` });
            continue;
          }
          const input = (call.input ?? {}) as Record<string, unknown>;
          tools.push({ name: call.name, input });
          const r = await runTool(call.name, input, now);
          for (const l of r.links) seen.add(l.href);
          hrefsIn(r.data, seen);
          results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify({ ...((r.data as object) ?? {}), links: r.links }) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      if (msg.stop_reason === "max_tokens") { error = `The answer was cut off at ${MAX_OUTPUT_TOKENS} tokens. Ask something narrower.`; break; }
      if (msg.stop_reason === "refusal") { error = "The model declined to answer that."; break; }
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      let raw: Partial<AskAnswer>;
      try { raw = JSON.parse(text) as Partial<AskAnswer>; } catch { raw = { answer: text }; }
      // An empty answer (a progress note in the answer's format): ask once for the answer itself.
      if (!String(raw.answer ?? "").trim() && !nudged) {
        nudged = true;
        messages.push({ role: "assistant", content: msg.content }, { role: "user", content: "Answer the question now, from what the lookups returned (or say what's missing)." });
        continue;
      }
      answer = cleanAnswer(raw, seen);
      break;
    }
    if (!answer && !error) error = "No answer after the lookups.";
  } catch (e) {
    error = `The AI call failed: ${(e as Error).message}`;
  }

  const d = db();
  const cost = { input_tokens: spent.input, output_tokens: spent.output, cost_usd: round6(spent.usd), cost_gbp: round6(spent.gbp) };
  const hash = createHash("sha256").update(`${q}|${now.toISOString()}`).digest("hex").slice(0, 32);
  // One row a question in the AI call log (tokens and £ add up every round).
  must(await d.from("ads_ai_calls").insert({ feature: "ask_scout", subject: q.slice(0, 200), data_hash: hash, model: s.model, trigger: "user", thinking_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, ...cost, result: answer, error }), "log call");
  const saved = must(await d.from("ask_scout_history").insert({ question: q, answer, error, tools, model: s.model, ...cost, created_at: now.toISOString() }).select("*").single(), "save question") as AskRun;
  await trimHistory();
  return normalise(saved);
}

const normalise = (r: AskRun): AskRun => ({ ...r, input_tokens: Number(r.input_tokens), output_tokens: Number(r.output_tokens), cost_gbp: Number(r.cost_gbp), tools: r.tools ?? [] });

/** The last 20 questions, newest first. */
export async function askHistory(): Promise<AskRun[]> {
  const r = await db().from("ask_scout_history").select("*").order("created_at", { ascending: false }).limit(HISTORY);
  return r.error ? [] : (r.data as AskRun[]).map(normalise);
}

/** Keep the newest 20. */
async function trimHistory() {
  const d = db();
  const old = must(await d.from("ask_scout_history").select("id").order("created_at", { ascending: false }).range(HISTORY, HISTORY + 200), "history") as { id: string }[];
  if (old.length) must(await d.from("ask_scout_history").delete().in("id", old.map((o) => o.id)), "trim history");
}
