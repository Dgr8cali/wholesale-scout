import { dashboard } from "@/lib/server/dashboard";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => Response.json(await dashboard()));
