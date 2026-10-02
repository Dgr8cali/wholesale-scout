import type { NextRequest } from "next/server";
import { validFilters, type NicheHuntFilters } from "@/lib/pl/hunt";
import { handle } from "@/lib/server/http";
import { planHunt } from "@/lib/server/plHunt";

/** { filters }: the token estimate (tree, sizing, detail) against the balance, free to ask. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { filters?: Partial<NicheHuntFilters> };
  const f = validFilters(b.filters ?? {});
  if (typeof f === "string") return Response.json({ error: f }, { status: 400 });
  return Response.json(await planHunt(f));
});
