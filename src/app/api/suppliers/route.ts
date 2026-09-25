import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => {
  const rows = must(await db().from("suppliers").select("id, name, vat_basis, vat_rate, currency, mov, delivery_days, rating").order("name"), "suppliers");
  return Response.json({ suppliers: rows });
});
