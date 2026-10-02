import { handle } from "@/lib/server/http";
import { ngramReport } from "@/lib/server/adsRules";

export const GET = handle(async () => Response.json(await ngramReport()));
