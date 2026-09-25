import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

/** Saved layouts matching a header fingerprint, with their supplier's VAT basis and currency. */
export const GET = handle(async (req: NextRequest) => {
  const fp = req.nextUrl.searchParams.get("fingerprint");
  if (!fp) return Response.json({ error: "fingerprint required" }, { status: 400 });
  const rows = must(
    await db().from("supplier_mappings")
      .select("mapping, updated_at, supplier:suppliers(id, name, vat_basis, vat_rate, currency)")
      .eq("header_fingerprint", fp)
      .order("updated_at", { ascending: false }),
    "mappings",
  );
  return Response.json({ mappings: rows });
});
