import { handle } from "@/lib/server/http";
import { refreshInventory } from "@/lib/server/adsOps";

export const maxDuration = 60;

/** Fetch FBA inventory from SP-API now (the nightly sync does it too). */
export const POST = handle(async () => {
  const r = await refreshInventory();
  return Response.json(r, { status: r.ok ? 200 : 502 });
});
