import { handle } from "@/lib/server/http";
import { listBatches } from "@/lib/server/adsRules";

export const GET = handle(async () => Response.json({ batches: await listBatches() }));
