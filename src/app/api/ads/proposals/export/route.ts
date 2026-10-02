import { handle } from "@/lib/server/http";
import { exportApproved } from "@/lib/server/adsRules";

/** The approved proposals as one bulk-sheet batch. */
export const POST = handle(async () => {
  try {
    return Response.json(await exportApproved());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
