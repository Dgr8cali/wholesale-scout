import type { NextRequest } from "next/server";
import { businessSettings, saveBusinessSettings, type BusinessSettings } from "@/lib/server/business";
import { handle } from "@/lib/server/http";

/** Settings → Business: VAT registration and rate, and the Qogita account's region. */
export const GET = handle(async () => Response.json(await businessSettings()));

/** { vatRegistered?, vatRate?, qogitaRegion? }: a change of VAT basis is written into every screening profile. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as Partial<BusinessSettings>;
  return Response.json(await saveBusinessSettings(b));
});
