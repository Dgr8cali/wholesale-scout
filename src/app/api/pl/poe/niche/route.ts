import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { extJson, extOptions } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import { linkPoeCaptures } from "@/lib/server/plNiches";

export const OPTIONS = extOptions;

/**
 * { snapshotId }: "Niche only (no candidate)" in the extension's picker. The capture (already
 * saved) is linked to the imported niche whose customer need or alias is its title: best term
 * conversion and the Buying / Browse-only chip on Private label → Niches. No candidate is created
 * or touched. With no such niche yet, the capture stays and links when its category is imported.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { snapshotId?: string };
  if (!b.snapshotId) return extJson({ error: "snapshotId required" }, 400);
  const snap = (await db().from("pl_poe_snapshots").select("id, niche_title").eq("id", b.snapshotId).maybeSingle()).data as { id: string; niche_title: string | null } | null;
  if (!snap) return extJson({ error: "No such capture" }, 404);
  const r = await linkPoeCaptures(snap.id);
  return extJson({ ok: true, title: snap.niche_title, ...r });
});
