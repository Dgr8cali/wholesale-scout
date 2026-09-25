import type { NextRequest } from "next/server";
import { GATE_ORDER, type GateId } from "@/lib/screening/config";
import { chunks, db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { addOverride, listOverrides, OVERRIDES_MIGRATION, removeOverride } from "@/lib/server/overrides";
import { rescreenRun } from "@/lib/server/process";
import { resultIdsFor } from "@/lib/server/runRows";

interface Item {
  ean: string;
  asin: string | null;
}

const needsMigration = (e: unknown) => e instanceof Error && e.message === OVERRIDES_MIGRATION;

/** Re-score a run's rows for these products now; fetch in the background if any need data. */
async function refresh(req: NextRequest, runId: string | undefined, items: Item[]) {
  if (!runId || !items.length) return { rescored: 0, requeued: 0 };
  const resultIds = await resultIdsFor(runId, items);
  if (!resultIds.length) return { rescored: 0, requeued: 0 };
  const r = await rescreenRun(runId, null, { resultIds });
  if (r.requeued) scheduleNext(req.nextUrl.origin, runId);
  return r;
}

/** Every waiver, with the product's name when known. */
export const GET = handle(async () => {
  try {
    const overrides = await listOverrides();
    const titles = new Map<string, string>();
    for (const c of chunks([...new Set(overrides.map((o) => o.ean))])) {
      for (const p of must(await db().from("products").select("ean, asin, title").in("ean", c), "products") as { ean: string; asin: string | null; title: string | null }[]) {
        if (p.title) titles.set(`${p.ean}/${p.asin ?? ""}`, p.title);
      }
    }
    return Response.json({ overrides: overrides.map((o) => ({ ...o, title: titles.get(`${o.ean}/${o.asin ?? ""}`) ?? null })) });
  } catch (e) {
    if (needsMigration(e)) return Response.json({ overrides: [], unavailable: OVERRIDES_MIGRATION });
    throw e;
  }
});

/**
 * Waive (default) or un-waive a gate for one or more products:
 * { items: [{ ean, asin }], gate, reason?, action?: "waive" | "unwaive", runId? }.
 * With runId, that run's rows for those products are re-screened straight away.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { items?: Item[]; gate?: GateId; reason?: string | null; action?: "waive" | "unwaive"; runId?: string };
  if (!b.gate || !GATE_ORDER.includes(b.gate)) return Response.json({ error: "Choose a gate" }, { status: 400 });
  if (!Array.isArray(b.items) || !b.items.length) return Response.json({ error: "No products" }, { status: 400 });
  if ((b.reason ?? "").length > 300) return Response.json({ error: "Keep the reason under 300 characters" }, { status: 400 });
  try {
    for (const i of b.items) {
      if (b.action === "unwaive") await removeOverride({ ean: i.ean, asin: i.asin ?? null, gate: b.gate });
      else await addOverride(i.ean, i.asin ?? null, b.gate, b.reason);
    }
  } catch (e) {
    if (needsMigration(e)) return Response.json({ error: OVERRIDES_MIGRATION }, { status: 409 });
    throw e;
  }
  return Response.json({ ok: true, ...(await refresh(req, b.runId, b.items)) });
});

/** Remove one waiver by id (the Settings list). */
export const DELETE = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const removed = await removeOverride({ id });
  return Response.json({ ok: true, removed: removed.length });
});
