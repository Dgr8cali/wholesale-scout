import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { estimatePull, type QogitaFilters } from "@/lib/server/qogitaPull";

export const maxDuration = 60;

/** Before pulling: about how many products, minutes on Amazon and Keepa tokens. { filters } */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { filters?: QogitaFilters };
  try {
    return Response.json(await estimatePull(b.filters ?? ({} as QogitaFilters)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
