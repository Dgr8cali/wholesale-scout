import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { documentUrl } from "@/lib/server/documents";

/** Open (or with ?download=1, download) the file: a 60-second signed link. */
export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const url = await documentUrl((await ctx.params).id, req.nextUrl.searchParams.get("download") === "1");
  return url ? Response.redirect(url, 302) : Response.json({ error: "No such document" }, { status: 404 });
});
