import { after, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
import { rescreenRun } from "@/lib/server/process";

export const maxDuration = 60;

/** Re-run gates and score with a profile's current settings, from stored data. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { profileId?: string; storedOnly?: boolean };
  const result = await rescreenRun(id, body.profileId, { storedOnly: !!body.storedOnly });
  if (result.requeued) after(() => kickRun(req.nextUrl.origin, id));
  return Response.json(result);
});
