import type { NextRequest } from "next/server";
import type { LaunchInput } from "@/lib/ads/launch";
import { handle } from "@/lib/server/http";
import { createLaunch, launchDefaults, previewLaunch } from "@/lib/server/adsOps";
import { db, must } from "@/lib/server/db";

/** ?asin= or ?candidateId= (and ?price=): the launcher's starting values, and the products and candidates to pick from. */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const price = q.get("price") ? Number(q.get("price")) : null;
  const [defaults, prods, camps, cands] = await Promise.all([
    launchDefaults({ asin: q.get("asin"), candidateId: q.get("candidateId"), price: price != null && price > 0 ? price : null }),
    db().from("ads_products").select("asin, title"),
    db().from("ads_campaigns").select("asin").not("asin", "is", null),
    db().from("pl_candidates").select("id, name").order("updated_at", { ascending: false }),
  ]);
  const titles = new Map((must(prods, "products") as { asin: string; title: string | null }[]).map((p) => [p.asin, p.title]));
  const asins = [...new Set([...(must(camps, "campaigns") as { asin: string }[]).map((c) => c.asin), ...titles.keys()])].sort();
  return Response.json({ defaults, products: asins.map((a) => ({ asin: a, title: titles.get(a) ?? null })), candidates: must(cands, "candidates") });
});

/** { input, preview? }: the four campaigns and the plan (preview), or the sheet as a launch batch. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { input?: LaunchInput; preview?: boolean };
  if (!b.input) return Response.json({ error: "input" }, { status: 400 });
  const i = { ...b.input, asin: String(b.input.asin ?? "").toUpperCase(), price: Number(b.input.price), dailyBudget: Number(b.input.dailyBudget), targetAcos: Number(b.input.targetAcos), startingBid: Number(b.input.startingBid) };
  if (!(i.dailyBudget > 0) || !(i.startingBid > 0) || !(i.targetAcos > 0 && i.targetAcos < 1) || !(i.price > 0)) return Response.json({ error: "Price, daily budget, target ACoS and starting bid must be set" }, { status: 400 });
  try {
    return Response.json(b.preview ? previewLaunch(i) : await createLaunch(i));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
