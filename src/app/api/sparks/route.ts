import { sampleSeries, type SeriesPoint, type Sparks } from "@/lib/sparkline";
import { chunks, db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

const MAX_ASINS = 200;

/** 90-day rank and Buy Box sparklines from each ASIN's latest stored Keepa snapshot. No Keepa calls. */
export const POST = handle(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { asins?: unknown };
  const asins = [...new Set((Array.isArray(body.asins) ? body.asins : []).filter((a): a is string => typeof a === "string" && /^[A-Z0-9]{10}$/.test(a)))];
  if (asins.length > MAX_ASINS) return Response.json({ error: `at most ${MAX_ASINS} ASINs per request` }, { status: 400 });
  const now = Date.now();
  const sparks: Record<string, Sparks> = {};
  for (const c of chunks(asins, 50)) {
    const rows = must(
      await db().from("keepa_snapshots").select("asin, fetched_at, rank_series, buybox_series").in("asin", c).order("fetched_at", { ascending: false }),
      "snapshots",
    ) as { asin: string; rank_series: SeriesPoint[] | null; buybox_series: SeriesPoint[] | null }[];
    for (const r of rows) {
      if (sparks[r.asin]) continue; // newest first: keep the latest
      sparks[r.asin] = { rank: sampleSeries(r.rank_series, now), buyBox: sampleSeries(r.buybox_series, now) };
    }
  }
  return Response.json({ sparks });
});
