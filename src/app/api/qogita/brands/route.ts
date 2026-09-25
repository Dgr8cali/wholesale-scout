import type { NextRequest } from "next/server";
import { getQogita } from "@/lib/qogita/client";
import { handle } from "@/lib/server/http";

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Check a brand name against Qogita (its brand list has no search; brands match by slug). */
export const GET = handle(async (req: NextRequest) => {
  const q = getQogita();
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!q || !name) return Response.json({ brand: null });
  return Response.json({ brand: await q.brandBySlug(slugify(name)) });
});
