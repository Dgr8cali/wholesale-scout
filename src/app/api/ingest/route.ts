import { ingest, type IngestPayload } from "@/lib/server/ingest";
import { handle } from "@/lib/server/http";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const payload = (await req.json()) as IngestPayload;
  try {
    return Response.json(await ingest(payload));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
