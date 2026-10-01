import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { plSettings, savePlSettings } from "@/lib/server/pl";

export const GET = handle(async () => Response.json({ settings: await plSettings() }));
export const PUT = handle(async (req: NextRequest) => Response.json({ settings: await savePlSettings((await req.json().catch(() => ({}))) as Record<string, unknown>) }));
