import { handle } from "@/lib/server/http";
import { backfillImages } from "@/lib/server/images";

export const maxDuration = 60;

/** Fill in main images for products that have none yet (up to 400 per call). */
export const POST = handle(async () => {
  try {
    return Response.json(await backfillImages());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
