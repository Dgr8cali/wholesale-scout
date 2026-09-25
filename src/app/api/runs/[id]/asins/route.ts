import { handle } from "@/lib/server/http";
import { runAsins } from "@/lib/server/dgReport";

/** The run's ASINs as a one-column CSV, for Seller Central's Dangerous Goods lookup. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const asins = await runAsins((await ctx.params).id);
  return new Response(["ASIN", ...asins].join("\r\n") + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "x-asin-count": String(asins.length) },
  });
});
