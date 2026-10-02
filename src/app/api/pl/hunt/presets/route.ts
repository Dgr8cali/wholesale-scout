import type { NextRequest } from "next/server";
import { validFilters, type NicheHuntFilters } from "@/lib/pl/hunt";
import { handle } from "@/lib/server/http";
import { deletePreset, savePreset } from "@/lib/server/plHunt";

/** Save { name, filters } as a named preset (same name: replaced). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string; filters?: Partial<NicheHuntFilters> };
  const f = validFilters(b.filters ?? {});
  if (typeof f === "string") return Response.json({ error: f }, { status: 400 });
  if (!b.name?.trim()) return Response.json({ error: "Name the preset" }, { status: 400 });
  return Response.json({ preset: await savePreset(b.name, f) });
});

/** ?id= */
export const DELETE = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deletePreset(id);
  return Response.json({ ok: true });
});
