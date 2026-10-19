import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { findProducts } from "@/lib/server/productPage";

const MAX = 8;

/** The command palette's search (?q=): products by ASIN, EAN or title, candidates and suppliers by name, 8 of each at most. */
export const GET = handle(async (req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ products: [], candidates: [], suppliers: [] });
  const like = `%${q.replace(/[%_,()]/g, "")}%`;
  const d = db();
  const [products, candidates, suppliers] = await Promise.all([
    findProducts(q),
    d.from("pl_candidates").select("id, name, niche_keyword, status").or(`name.ilike.${like},niche_keyword.ilike.${like}`).order("updated_at", { ascending: false }).limit(MAX),
    d.from("suppliers").select("id, name, kind").ilike("name", like).order("name").limit(MAX),
  ]);
  return Response.json({
    products: products.slice(0, MAX).map((p) => ({ asin: p.asin, title: p.title, brand: p.brand })),
    candidates: must(candidates, "candidates"),
    suppliers: must(suppliers, "suppliers"),
  });
});
