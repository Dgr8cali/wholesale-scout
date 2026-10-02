import { handle } from "@/lib/server/http";
import { plDashboard } from "@/lib/server/pl";

/** Home's Private label tiles. */
export const GET = handle(async () => Response.json(await plDashboard()));
