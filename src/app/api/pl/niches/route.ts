import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { importNiches, listImports, nichePage, nicheStats, previewNicheImport, type NicheSort } from "@/lib/server/plNiches";

export const maxDuration = 60;

/**
 * One page of niches, filtered and sorted in SQL, with the total that match, the summary counts over
 * every niche in scope, and the imports. ?category=&minScore=&price=core|mid|low|high&status=active|all|new|…
 * &q=&hide=SPIKE,BIG_BRAND&sort=score&dir=desc&page=1&pageSize=100.
 */
export const GET = handle(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const hideFlags = p.has("hide") ? (p.get("hide") ?? "").split(",").filter(Boolean) : undefined;
  const category = p.get("category") || null;
  const [page, stats, imports] = await Promise.all([
    nichePage({
      category, minScore: p.get("minScore") ? Number(p.get("minScore")) : null, price: (p.get("price") || "") as never, status: p.get("status") || "active", q: p.get("q"),
      hideFlags, sort: (p.get("sort") || "score") as NicheSort, dir: p.get("dir") === "asc" ? "asc" : "desc", page: Number(p.get("page") || 1), pageSize: Number(p.get("pageSize") || 100),
    }),
    nicheStats({ category, hideFlags }),
    listImports(),
  ]);
  return Response.json({ ...page, stats, ...imports });
});

/** { action: "preview" | "import", text, category, filename? }: an Opportunity Explorer niche download. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { action?: string; text?: string; category?: string; filename?: string };
  if (!b.text) return Response.json({ error: "No file" }, { status: 400 });
  try {
    if (b.action === "import") return Response.json(await importNiches({ text: b.text, category: b.category ?? "", filename: b.filename ?? null }));
    return Response.json(await previewNicheImport(b.text, b.category ?? ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
