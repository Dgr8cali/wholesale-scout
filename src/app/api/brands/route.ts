import type { NextRequest } from "next/server";
import { brandsToChase } from "@/lib/brandMap";
import { APPROVAL_STATUSES, brandKey } from "@/lib/brands";
import { brandMapStale, brandSummaries } from "@/lib/server/brandMap";
import { db, loadProfile, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { forget, memo } from "@/lib/server/memo";
import { scheduleCall } from "@/lib/server/kick";

/**
 * The brand map: one row per brand seen in any run, on the current default profile, sorted
 * by the wholesale-friendly score. ?chase=5: Home's "Brands to chase" instead. Served from the
 * cached map; when that's behind, a refresh starts in the background and `updating` says so.
 */
export const GET = handle(async (req: NextRequest) => {
  // The map and whether it's behind are kept for 60 s (Home asks for them too).
  const stale = await memo("brands:stale", 60_000, brandMapStale);
  if (stale) scheduleCall(req.nextUrl.origin, "/api/brands/refresh");
  const [brands, profile] = await Promise.all([memo("brands:all", 60_000, brandSummaries), loadProfile(null)]);
  const chase = Number(req.nextUrl.searchParams.get("chase"));
  const awaiting = brands.filter((b) => b.gating === "approval_needed" || b.gating === "applied");
  return Response.json({
    brands: chase > 0 ? brandsToChase(brands, chase) : brands,
    awaiting: { brands: awaiting.length, passing: awaiting.reduce((s, b) => s + b.pass + b.warn, 0) },
    updating: stale,
    profile: { id: profile.id, name: profile.name },
  });
});

/** Save a brand's approval requirement, status and date. */
export const PUT = handle(async (req: Request) => {
  const body = (await req.json()) as { brand?: string; status?: string; requirement?: string | null; status_date?: string | null };
  const brand = body.brand?.trim();
  const key = brandKey(brand);
  if (!brand || !key) return Response.json({ error: "brand is required" }, { status: 400 });
  if (!APPROVAL_STATUSES.includes(body.status as (typeof APPROVAL_STATUSES)[number])) {
    return Response.json({ error: `status must be one of ${APPROVAL_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (body.status_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.status_date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  must(
    await db().from("brand_approvals").upsert(
      { brand_key: key, brand, status: body.status, requirement: body.requirement?.trim() || null, status_date: body.status_date || null, updated_at: new Date().toISOString() },
      { onConflict: "brand_key" },
    ),
    "save approval",
  );
  forget("brands:");
  return Response.json({ ok: true });
});
