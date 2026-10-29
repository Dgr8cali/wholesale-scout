import type { NextRequest } from "next/server";
import { allowedEmails, hasPasskey, passwordFallbackOn } from "@/lib/server/auth";
import { currentSession } from "@/lib/server/authRoutes";
import { signInEmailConfigured } from "@/lib/server/email";
import { handle } from "@/lib/server/http";

/**
 * What the sign-in page offers (public): a passkey, an emailed link when email is set up, and the
 * app password while no passkey exists yet (to add the first) or with AUTH_PASSWORD_FALLBACK=1.
 */
export const GET = handle(async (req: NextRequest) => {
  const passkeys = await hasPasskey();
  return Response.json({
    signedIn: !!(await currentSession(req)),
    ready: allowedEmails().length > 0,
    passkeys,
    email: signInEmailConfigured(),
    password: !!process.env.APP_PASSWORD && (passwordFallbackOn() || !passkeys),
  });
});
