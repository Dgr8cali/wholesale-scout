import type { NextRequest } from "next/server";
import {
  addFavourite,
  FAVOURITES_MIGRATION,
  favouritesWithLatest,
  listFavourites,
  removeFavourite,
  setFavouriteNote,
} from "@/lib/server/favourites";
import { handle } from "@/lib/server/http";

const needsMigration = (e: unknown) => e instanceof Error && e.message === FAVOURITES_MIGRATION;

/** ?light=1: just the stars (for the run page); otherwise each with its latest result. */
export const GET = handle(async (req: NextRequest) => {
  try {
    if (req.nextUrl.searchParams.get("light")) return Response.json({ favourites: await listFavourites() });
    return Response.json({ items: await favouritesWithLatest() });
  } catch (e) {
    if (needsMigration(e)) return Response.json({ favourites: [], items: [], unavailable: FAVOURITES_MIGRATION });
    throw e;
  }
});

/** Star a product: { ean, asin, note? }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { ean?: string; asin?: string | null; note?: string | null };
  if (!b.ean || !/^\d{8,14}$/.test(b.ean)) return Response.json({ error: "ean required" }, { status: 400 });
  try {
    return Response.json({ favourite: await addFavourite(b.ean, b.asin ?? null, b.note) });
  } catch (e) {
    if (needsMigration(e)) return Response.json({ error: FAVOURITES_MIGRATION }, { status: 409 });
    throw e;
  }
});

/** Edit a note: { id, note }. */
export const PATCH = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { id?: string; note?: string | null };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  if ((b.note ?? "").length > 500) return Response.json({ error: "Keep the note under 500 characters" }, { status: 400 });
  await setFavouriteNote(b.id, b.note ?? null);
  return Response.json({ ok: true });
});

/** Un-star: ?id= */
export const DELETE = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await removeFavourite(id);
  return Response.json({ ok: true });
});
