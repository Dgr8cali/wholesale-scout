import type { NextRequest } from "next/server";
import { bulkFavourites, FAVOURITES_MIGRATION } from "@/lib/server/favourites";
import { handle } from "@/lib/server/http";

/** Star or un-star several products: { items: [{ ean, asin }], action: "star" | "unstar" }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { items?: { ean: string; asin: string | null }[]; action?: "star" | "unstar" };
  if (!Array.isArray(b.items) || !b.items.length) return Response.json({ error: "No products" }, { status: 400 });
  if (b.action !== "star" && b.action !== "unstar") return Response.json({ error: "action must be star or unstar" }, { status: 400 });
  try {
    return Response.json({ favourites: await bulkFavourites(b.items, b.action) });
  } catch (e) {
    if (e instanceof Error && e.message === FAVOURITES_MIGRATION) return Response.json({ error: FAVOURITES_MIGRATION }, { status: 409 });
    throw e;
  }
});
