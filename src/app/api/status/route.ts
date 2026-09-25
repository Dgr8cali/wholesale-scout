import { getKeepa } from "@/lib/keepa/client";
import { spApiConfigFromEnv } from "@/lib/spapi/client";

/** Which integrations are configured. Never returns secret values. */
export async function GET() {
  const sp = spApiConfigFromEnv();
  return Response.json({
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    spapi: !!sp,
    spapiSellerId: !!sp?.sellerId,
    keepa: getKeepa().available,
    password: !!process.env.APP_PASSWORD,
  });
}
