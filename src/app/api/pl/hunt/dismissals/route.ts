import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { dismissNiche, undismissNiche } from "@/lib/server/plHunt";

/** { key, name?, reason? }: hide the niche from every hunt. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { key?: string; name?: string; reason?: string };
  if (!b.key) return Response.json({ error: "key required" }, { status: 400 });
  await dismissNiche(b.key, b.name ?? null, b.reason ?? null);
  return Response.json({ ok: true });
});

/** ?key=: show it again. */
export const DELETE = handle(async (req: NextRequest) => {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  await undismissNiche(key);
  return Response.json({ ok: true });
});
