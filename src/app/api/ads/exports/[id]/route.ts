import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { batchFile, markUploaded } from "@/lib/server/adsRules";

type Ctx = { params: Promise<{ id: string }> };

/** The batch's bulk sheet (.xlsx), to upload in Amazon Ads → Bulk operations. */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    const { label, data } = await batchFile((await ctx.params).id);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="ads-bulk-${label.replace(/[^\w-]+/g, "-")}.xlsx"`,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
});

/** { uploaded: boolean }: record (or clear) that the sheet was uploaded to Amazon Ads. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { uploaded?: boolean };
  await markUploaded((await ctx.params).id, b.uploaded !== false);
  return Response.json({ ok: true });
});
