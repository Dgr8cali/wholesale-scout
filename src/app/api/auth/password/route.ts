import type { NextRequest } from "next/server";
import { hasPasskey, ownerEmail, passwordFallbackOn, safeEqual } from "@/lib/server/auth";
import { limited, signedIn } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";

/**
 * { password }: the app password (APP_PASSWORD), only while no passkey exists yet (so the first
 * can be added) or with AUTH_PASSWORD_FALLBACK=1 (emergency).
 */
export const POST = handle(async (req: NextRequest) => {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  const password = process.env.APP_PASSWORD;
  const owner = ownerEmail();
  if (!password || !owner || (!passwordFallbackOn() && (await hasPasskey()))) return Response.json({ error: "Sign in with your passkey." }, { status: 403 });
  const given = String(((await req.json().catch(() => ({}))) as { password?: unknown }).password ?? "");
  if (!safeEqual(given, password)) return Response.json({ error: "That isn't the app password." }, { status: 401 });
  return signedIn(req, owner, "password");
});
