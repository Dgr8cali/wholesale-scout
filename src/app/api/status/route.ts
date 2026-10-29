import { getKeepa } from "@/lib/keepa/client";
import { spApiConfigFromEnv } from "@/lib/spapi/client";
import { allowedEmails, passwordFallbackOn } from "@/lib/server/auth";
import { signInEmailConfigured } from "@/lib/server/email";

/** Which integrations are configured. Never returns secret values. */
export async function GET() {
  const sp = spApiConfigFromEnv();
  return Response.json({
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    spapi: !!sp,
    spapiSellerId: !!sp?.sellerId,
    keepa: getKeepa().available,
    // Sign-in: an allowlist set, email links possible, the password fallback on.
    login: { allowlist: allowedEmails().length > 0, email: signInEmailConfigured(), passwordFallback: passwordFallbackOn() },
    qogita: !!(process.env.QOGITA_EMAIL && process.env.QOGITA_PASSWORD),
  });
}
