import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { supplierLedger } from "@/lib/server/suppliers";

/** Suppliers. ?stats=1: the ledger, each with its runs, products, passes and brands. */
export const GET = handle(async (req: NextRequest) => {
  if (req.nextUrl.searchParams.get("stats")) return Response.json({ suppliers: await supplierLedger() });
  const rows = must(await db().from("suppliers").select("id, name, vat_basis, vat_rate, currency, mov, delivery_days, rating").order("name"), "suppliers");
  return Response.json({ suppliers: rows });
});
