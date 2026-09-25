import type { NextRequest } from "next/server";
import { validShape, type HuntShape } from "@/lib/hunt";
import { handle } from "@/lib/server/http";
import { huntStart, startHunt } from "@/lib/server/hunt";
import { scheduleNext } from "@/lib/server/kick";

export const maxDuration = 60;

/** The default profile's shape, the categories known, and Keepa's balance (free to ask). */
export const GET = handle(async () => Response.json(await huntStart()));

/** Run the Product Finder with { shape } and start a run with no cost from what it finds. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { shape?: Partial<HuntShape> };
  const shape = validShape(b.shape ?? {});
  if (typeof shape === "string") return Response.json({ error: shape }, { status: 400 });
  const r = await startHunt(shape);
  if (r.runId) scheduleNext(req.nextUrl.origin, r.runId);
  return Response.json(r);
});
