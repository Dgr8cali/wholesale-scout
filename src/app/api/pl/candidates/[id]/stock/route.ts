import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { listPurchases } from "@/lib/server/purchases";
import { stockLevels } from "@/lib/server/stock";

type Ctx = { params: Promise<{ id: string }> };

/** The Launch tab's stock check: the listing ASIN's stock item (units per bucket, cover) and its purchases (what's inbound). */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const c = must(await db().from("pl_candidates").select("listing_asin").eq("id", (await ctx.params).id).maybeSingle(), "candidate") as { listing_asin: string | null } | null;
  if (!c) return Response.json({ error: "No such candidate" }, { status: 404 });
  const asin = c.listing_asin;
  if (!asin) return Response.json({ asin: null, item: null, purchases: [], fbaSynced: null });
  const [levels, purchases] = await Promise.all([stockLevels(), listPurchases(asin)]);
  const it = levels.items.find((x) => x.item.asin === asin) ?? null;
  return Response.json({
    asin, fbaSynced: levels.fbaSynced,
    item: it && { id: it.item.id, name: it.item.name, levels: it.levels, total: it.total, status: it.status, cover: it.cover.total, perDay: it.demand.total, fbaMatched: it.fba.matched },
    purchases: purchases.map((p) => ({ id: p.id, units: p.units, status: p.status, orderedOn: p.ordered_on, expected: p.expected_date ?? null, supplier: p.supplier_name, landed: p.landed_gbp, tracking: p.tracking_number ?? null })),
  });
});
