import { handle } from "@/lib/server/http";
import { auditLog } from "@/lib/server/stockEdit";

/** Every Stock edit and delete, newest first (the last 500). */
export const GET = handle(async () => Response.json({ audit: await auditLog(500) }));
