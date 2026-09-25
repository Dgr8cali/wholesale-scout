import { after, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
import { rescreenRun } from "@/lib/server/process";

export const maxDuration = 60;

const auth = () => (process.env.APP_PASSWORD ? { authorization: `Basic ${btoa(`worker:${process.env.APP_PASSWORD}`)}` } : undefined);

/**
 * Re-run every gate and the score with the profile as saved now, from stored data. Works for
 * about 40 seconds a call; while rows are left it calls itself with { continuing: true }.
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { profileId?: string; storedOnly?: boolean; continuing?: boolean };
  const result = await rescreenRun(id, body.profileId, { storedOnly: !!body.storedOnly, continuing: !!body.continuing });
  if (result.requeued) after(() => kickRun(req.nextUrl.origin, id));
  if (result.remaining) {
    after(async () => {
      try {
        await fetch(`${req.nextUrl.origin}/api/runs/${id}/rescreen`, {
          method: "POST", headers: { "content-type": "application/json", ...auth() }, body: JSON.stringify({ continuing: true }), signal: AbortSignal.timeout(2_500),
        });
      } catch {
        // Timed out waiting, as intended; the run page also resumes a stalled re-screen.
      }
    });
  }
  return Response.json(result);
});
