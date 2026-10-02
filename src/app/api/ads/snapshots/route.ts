import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listSnapshots, takeSnapshotNow } from "@/lib/server/adsOps";

export const GET = handle(async () => Response.json({ snapshots: await listSnapshots() }));

/** { label }: snapshot every keyword bid and state, budget and placement as last imported (the last 20 are kept). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { label?: string };
  return Response.json({ snapshot: await takeSnapshotNow(String(b.label ?? "")) });
});
