import type { NextRequest } from "next/server";
import { campaignReport, createCampaignReport, last7Days } from "@/lib/adsapi/client";
import { compareWeek } from "@/lib/adsapi/compare";
import { adsSession, importedDays } from "@/lib/server/adsConnection";
import { handle } from "@/lib/server/http";

/** Start the test pull: the last 7 full days of Sponsored Products campaign data for the chosen profile. Returns the report to poll. */
export const POST = handle(async () => {
  const { env, token, profileId } = await adsSession();
  if (!profileId) return Response.json({ error: "Choose the UK profile first" }, { status: 400 });
  const { from, to } = last7Days();
  const reportId = await createCampaignReport(env, token, profileId, from, to);
  return Response.json({ reportId, from, to });
});

/** ?reportId&from&to: still running, failed, or done (with the API's numbers beside what was imported). */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const reportId = q.get("reportId"), from = q.get("from"), to = q.get("to");
  if (!reportId || !from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return Response.json({ error: "reportId, from and to are required" }, { status: 400 });
  const { env, token, profileId } = await adsSession();
  if (!profileId) return Response.json({ error: "Choose the UK profile first" }, { status: 400 });
  const state = await campaignReport(env, token, profileId, reportId);
  if (state.status !== "COMPLETED") return Response.json(state);
  const comparison = compareWeek(state.rows, await importedDays(from, to), from, to);
  return Response.json({ status: "COMPLETED", from, to, comparison });
});
