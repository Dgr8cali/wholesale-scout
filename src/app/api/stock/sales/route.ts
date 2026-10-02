import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listSales, recordSale } from "@/lib/server/stock";

/** ?channel=: sales outside Amazon. */
export const GET = handle(async (req: NextRequest) => Response.json({ sales: await listSales(req.nextUrl.searchParams.get("channel")) }));

/** { itemId, listingId?, bucket, channel, orderId?, date?, quantity, priceEach, note? }: checks the bucket holds it. */
export const POST = handle(async (req: NextRequest) => {
  try {
    return Response.json(await recordSale((await req.json().catch(() => ({}))) as never));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
