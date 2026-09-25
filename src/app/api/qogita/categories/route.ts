import { getQogita } from "@/lib/qogita/client";
import { handle } from "@/lib/server/http";
import { qogitaCategories } from "@/lib/server/qogitaPull";

/** Every Qogita category with its path, for the category picker. */
export const GET = handle(async () => {
  const q = getQogita();
  if (!q) return Response.json({ available: false, categories: [] });
  return Response.json({ available: true, categories: await qogitaCategories(q) });
});
