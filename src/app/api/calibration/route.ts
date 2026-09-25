import type { NextRequest } from "next/server";
import { calibrate } from "@/lib/calibration";
import { actualsFor } from "@/lib/server/amazonSync";
import { db, loadProfile, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { forget } from "@/lib/server/memo";
import { listPurchases } from "@/lib/server/purchases";

async function current() {
  const [purchases, profile] = await Promise.all([listPurchases(), loadProfile(null)]);
  const actuals = await actualsFor(purchases);
  const calibration = calibrate(purchases.map((p) => ({ prediction: p.prediction, actuals: actuals.get(p.id) ?? null, units: p.units })), profile.config.calibration.shareFactor);
  return { calibration, profile: { id: profile.id, name: profile.name, ...profile.config.calibration } };
}

/** How the predictions compare with your purchases' actual results, and the suggested correction. */
export const GET = handle(async () => Response.json(await current()));

/** { action: "apply" } the suggested your-share factor to the default profile, or { action: "reset" } it to 1. */
export const POST = handle(async (req: NextRequest) => {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const now = await current();
  const factor = action === "reset" ? 1 : now.calibration.suggestedFactor;
  if (action !== "reset" && (action !== "apply" || factor == null)) return Response.json({ error: "Nothing to apply yet" }, { status: 400 });
  const d = db();
  const row = must(await d.from("profiles").select("config").eq("id", now.profile.id).single(), "profile") as { config: Record<string, unknown> };
  must(await d.from("profiles").update({
    config: { ...row.config, calibration: { shareFactor: factor, basedOn: action === "reset" ? null : now.calibration.share.n, appliedAt: action === "reset" ? null : new Date().toISOString() } },
    updated_at: new Date().toISOString(),
  }).eq("id", now.profile.id), "save calibration");
  forget("brands:");
  return Response.json(await current());
});
