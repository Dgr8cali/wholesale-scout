import type { NextRequest } from "next/server";
import { runCheckFor, startCheck, verdictCard } from "@/lib/server/check";
import { asinFromUrl } from "@/lib/check/parse";
import { db } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";

export const maxDuration = 60;

/** A check this recent for the same ASIN and cost is answered from, instead of screening again. */
const REUSE_MS = 12 * 3_600_000;

// The extension calls from its own origin; the password (Basic or Bearer) is the protection.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * For the Chrome extension: the verdict card for an ASIN as JSON.
 *
 *   GET /api/extension/check?asin=B0ABC12345[&cost=4.73][&supplier=Name][&fresh=1]
 *   GET /api/extension/check?run=<runId>          (poll a card that was still pending)
 *
 * `asin` may also be an Amazon product link. Authorization: Basic (any user, APP_PASSWORD) or
 * Bearer APP_PASSWORD. A check of the same ASIN and cost in the last 12 hours is reused unless
 * fresh=1. The card has `pending: true` while Keepa or gating are still to come.
 */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
  const run = q.get("run");
  if (run) {
    const card = await verdictCard(run);
    return card ? json({ card }) : json({ error: "Run not found" }, 404);
  }
  const raw = (q.get("asin") ?? "").trim();
  const asin = /^https?:\/\//i.test(raw) ? asinFromUrl(raw) : raw.toUpperCase();
  if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return json({ error: "asin must be an ASIN or an Amazon product link" }, 400);
  const cost = q.get("cost")?.trim();
  if (cost && !(Number(cost.replace(",", ".")) > 0)) return json({ error: "cost must be a positive number (landed, GBP)" }, 400);
  const text = cost ? `${asin}, ${cost}` : asin;

  if (q.get("fresh") !== "1") {
    const since = new Date(Date.now() - REUSE_MS).toISOString();
    const prior = await db().from("runs").select("id").eq("stats->check->>input", text).neq("status", "error")
      .is("archived_at", null).gte("started_at", since).order("started_at", { ascending: false }).limit(1);
    const id = (prior.data as { id: string }[] | null)?.[0]?.id;
    if (id) {
      const card = await verdictCard(id);
      if (card) return json({ card, reused: true });
    }
  }

  let started;
  try {
    started = await startCheck({ text, supplier: q.get("supplier") });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  const done = await runCheckFor(started.runId, 12_000);
  if (!done) scheduleNext(req.nextUrl.origin, started.runId);
  return json({ card: await verdictCard(started.runId), reused: false });
});
