import { after, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { recentSupplierSearches, runSupplierSearch, startSupplierSearch } from "@/lib/server/supplierSearch";
import { parseSearchRequest } from "@/lib/supplierSearch/display";

/** The latest searches, without their rows. */
export const GET = handle(async () => Response.json({ searches: await recentSupplierSearches() }));

/** Start a search with { query, kind }. It carries on after this answers; poll /api/supplier-searches/[id]. */
export const POST = handle(async (req: NextRequest) => {
  const parsed = parseSearchRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
  const started = await startSupplierSearch(parsed);
  if ("error" in started) return Response.json({ error: started.error }, { status: started.status });
  after(() => runSupplierSearch(started.id, parsed));
  return Response.json({ id: started.id });
});
