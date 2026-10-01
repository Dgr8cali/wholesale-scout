import type { NextRequest } from "next/server";
import { extJson, extOptions } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import { attachPoe } from "@/lib/server/pl";

export const OPTIONS = extOptions;
/** { snapshotId, candidateId }: the candidate picked for a capture whose niche matched none. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { snapshotId?: string; candidateId?: string };
  if (!b.snapshotId || !b.candidateId) return extJson({ error: "snapshotId and candidateId required" }, 400);
  return extJson({ ok: true, filled: await attachPoe(b.snapshotId, b.candidateId) });
});
