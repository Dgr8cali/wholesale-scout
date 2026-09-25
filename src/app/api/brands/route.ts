import { APPROVAL_STATUSES, brandKey, groupApprovals, type ApprovalResult, type BrandApproval } from "@/lib/brands";
import { withDefaults, type ProfileConfig } from "@/lib/screening/config";
import { chunks, db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

/** Every approval-needed brand across runs, with fee-engine passes and approval status. */
export const GET = handle(async () => {
  const d = db();
  const results: (Omit<ApprovalResult, "floors"> & { run_id: string })[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(
      await d.from("results")
        .select("run_id, product_id, updated_at, profit, roi, margin, gate_outcomes, inputs, product:products(asin, ean, title, brand), offer:offers(brand)")
        .eq("status", "done")
        .order("updated_at")
        .range(from, from + 999),
      "results",
    ) as unknown as (Omit<ApprovalResult, "floors"> & { run_id: string })[];
    results.push(...page);
    if (page.length < 1000) break;
  }
  const floors = new Map<string, ApprovalResult["floors"]>();
  for (const c of chunks([...new Set(results.map((r) => r.run_id))])) {
    const runs = must(await d.from("runs").select("id, profile_snapshot").in("id", c), "runs") as { id: string; profile_snapshot: ProfileConfig }[];
    for (const r of runs) floors.set(r.id, withDefaults(r.profile_snapshot).gates.fees);
  }
  const approvals = must(await d.from("brand_approvals").select("brand_key, brand, status, requirement, status_date"), "approvals") as BrandApproval[];
  const fallback = withDefaults(null).gates.fees;
  const brands = groupApprovals(results.map((r) => ({ ...r, floors: floors.get(r.run_id) ?? fallback })), approvals);
  return Response.json({ brands });
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
  return Response.json({ ok: true });
});
