import { handle } from "@/lib/server/http";
import { todaySteps } from "@/lib/server/nextSteps";

/** Today: the ranked next steps (snoozed and dismissed ones out), the key numbers, the next dated thing. */
export const GET = handle(async () => Response.json(await todaySteps()));
