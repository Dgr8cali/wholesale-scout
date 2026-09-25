import type { NextRequest } from "next/server";
import { sellerIdFrom } from "@/lib/check/seller";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { scanPreview, startScan } from "@/lib/server/sellerScan";

export const maxDuration = 60;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/**
 * What scanning a seller would cover and cost. ?seller=<ID or storefront link>[&lookup=1][&profileId=]
 * Without lookup=1 only a storefront cached in the last 7 days is used ({ preview: null } otherwise),
 * so looking one up (10 Keepa tokens) is always a deliberate click.
 */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const sellerId = sellerIdFrom(q.get("seller") ?? "");
  if (!sellerId) return bad("Paste an Amazon seller ID (A…) or a storefront link");
  try {
    return Response.json({ sellerId, preview: await scanPreview(sellerId, { lookup: q.get("lookup") === "1", profileId: q.get("profileId") }) });
  } catch (e) {
    return bad((e as Error).message, 409);
  }
});

/** Start the scan: { seller, profileId? } → { runId }. The run carries on in the background. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { seller?: string; profileId?: string | null };
  const sellerId = sellerIdFrom(b.seller ?? "");
  if (!sellerId) return bad("Paste an Amazon seller ID (A…) or a storefront link");
  let started;
  try {
    started = await startScan(sellerId, b.profileId);
  } catch (e) {
    return bad((e as Error).message, 409);
  }
  scheduleNext(req.nextUrl.origin, started.runId);
  return Response.json(started);
});
