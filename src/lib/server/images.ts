import "server-only";
import { getSpApi } from "../spapi/client";
import { chunks, db, must } from "./db";

/**
 * Main images for products that don't have one yet (screened before images were kept):
 * SP-API catalog by ASIN, 20 per request, free. '' marks "looked, Amazon has none".
 */
export async function backfillImages(limit = 400): Promise<{ looked: number; found: number }> {
  const spapi = getSpApi();
  if (!spapi) throw new Error("SP-API isn't configured");
  const d = db();
  const res = await d.from("products").select("id, asin").not("asin", "is", null).is("image_url", null).limit(limit);
  if (res.error && /image_url/.test(res.error.message)) throw new Error("Run migration 20260926000900_product_images.sql first");
  const products = must(res, "products") as { id: string; asin: string }[];
  const images = await spapi.imagesByAsins(products.map((p) => p.asin));
  let found = 0;
  for (const c of chunks(products, 50)) {
    await Promise.all(c.map(async (p) => {
      const url = images.get(p.asin) ?? "";
      if (url) found++;
      must(await d.from("products").update({ image_url: url }).eq("id", p.id), "image");
    }));
  }
  return { looked: products.length, found };
}
