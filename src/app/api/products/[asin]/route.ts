import { handle } from "@/lib/server/http";
import { productView } from "@/lib/server/productPage";

/** Everything the app knows about one ASIN (the product page). No Amazon or Keepa calls. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ asin: string }> }) => {
  const asin = (await ctx.params).asin.toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return Response.json({ error: "Not an ASIN" }, { status: 400 });
  const view = await productView(asin);
  return view ? Response.json(view) : Response.json({ error: "No product with that ASIN yet: check it on Check ASINs." }, { status: 404 });
});
