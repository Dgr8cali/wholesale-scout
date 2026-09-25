import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteIpBrand, loadIpRisk, saveIpBrand } from "@/lib/server/ipRisk";

/** Your IP-risk brand list. */
export const GET = handle(async () => Response.json({ brands: await loadIpRisk() }));

/** Add or update one: { id?, brand, level, aliases, note, source, reported_on }. */
export const POST = handle(async (req: NextRequest) => {
  try {
    return Response.json({ brand: await saveIpBrand(await req.json()) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** Remove one: ?id= */
export const DELETE = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteIpBrand(id);
  return Response.json({ ok: true });
});
