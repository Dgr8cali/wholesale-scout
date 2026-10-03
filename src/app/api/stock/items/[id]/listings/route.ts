import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteListing } from "@/lib/server/stockEdit";
import { db, must } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };
const n = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** { marketplace, marketplace_sku?, title?, url?, price?, fee_pct?, default_bucket? }: a listing for the item. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!String(b.marketplace ?? "").trim()) return Response.json({ error: "Which marketplace?" }, { status: 400 });
  const row = {
    item_id: (await ctx.params).id, marketplace: String(b.marketplace).trim().slice(0, 60), marketplace_sku: String(b.marketplace_sku ?? "").trim() || null,
    title: String(b.title ?? "").trim() || null, url: String(b.url ?? "").trim() || null, price: n(b.price), fee_pct: n(b.fee_pct),
    default_bucket: ["home", "tiktok_fbt", "fba"].includes(String(b.default_bucket)) ? b.default_bucket : null,
  };
  return Response.json({ listing: must(await db().from("stock_listings").insert(row).select("*").single(), "listing") });
});

/** ?listing=<id>: remove a listing. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    await deleteListing((await ctx.params).id, req.nextUrl.searchParams.get("listing") ?? "");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
