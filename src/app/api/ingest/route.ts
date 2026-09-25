import type { NextRequest } from "next/server";
import { ingest, type IngestPayload } from "@/lib/server/ingest";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";

export const maxDuration = 60;

/** Store the rows, then start screening in the background straight away. */
export const POST = handle(async (req: NextRequest) => {
  const payload = (await req.json()) as IngestPayload;
  try {
    const result = await ingest(payload);
    scheduleNext(req.nextUrl.origin, result.runId);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
