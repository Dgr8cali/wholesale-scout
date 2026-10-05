import { handle } from "@/lib/server/http";
import { reparsePoe } from "@/lib/server/pl";
import { linkPoeCaptures } from "@/lib/server/plNiches";

export const maxDuration = 60;

/** Read every stored Opportunity Explorer capture again with the current parser and refill Gates 3 and 5 (and the imported niches' term conversion). */
export const POST = handle(async () => {
  const snapshots = await reparsePoe();
  return Response.json({ snapshots, nichesLinked: (await linkPoeCaptures()).linked });
});
