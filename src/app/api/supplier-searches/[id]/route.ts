import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { getSupplierSearch } from "@/lib/server/supplierSearch";

export const GET = handle(async (_: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Search not found." }, { status: 404 });
  const search = await getSupplierSearch(id);
  return search ? Response.json({ search }) : Response.json({ error: "Search not found." }, { status: 404 });
});
