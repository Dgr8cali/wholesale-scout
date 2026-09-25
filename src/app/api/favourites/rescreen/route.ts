import { after, type NextRequest } from "next/server";
import { rescreenFavourites } from "@/lib/server/favourites";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";

/** A new run, "Favourites <date>", with only the favourites; screening starts in the background. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { profileId?: string };
  try {
    const r = await rescreenFavourites(b.profileId);
    after(() => kickRun(req.nextUrl.origin, r.runId));
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
