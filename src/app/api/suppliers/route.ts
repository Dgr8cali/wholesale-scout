import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { createSupplier, supplierLedger } from "@/lib/server/suppliers";

/** Suppliers. ?stats=1: the ledger, each with its runs, products, passes and brands. */
export const GET = handle(async (req: NextRequest) => {
  if (req.nextUrl.searchParams.get("stats")) return Response.json({ suppliers: await supplierLedger() });
  const rows = must(await db().from("suppliers").select("id, name, kind, marketplace, vat_basis, vat_rate, currency, mov, delivery_days, rating").order("name"), "suppliers");
  return Response.json({ suppliers: rows });
});

/** A supplier added from Stock: { name, kind?, marketplace?, website?, contact?, leadTimeDays?, notes? }. A name already there returns that one (existed). */
export const POST = handle(async (req: NextRequest) => {
  try {
    return Response.json(await createSupplier((await req.json().catch(() => ({}))) as never));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
