import { NextResponse, type NextRequest } from "next/server";
import { ownerEmail } from "@/lib/server/auth";
import { challengeCookie, currentSession } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";
import { registrationOptions } from "@/lib/server/passkeys";

/** Step 1 of adding a passkey to the signed-in account. */
export const POST = handle(async (req: NextRequest) => {
  const email = (await currentSession(req))?.email ?? ownerEmail();
  if (!email) return Response.json({ error: "Set AUTH_ALLOWED_EMAILS on the server first." }, { status: 400 });
  const { options, challengeId } = await registrationOptions(email, req.nextUrl.origin);
  const res = NextResponse.json(options);
  res.cookies.set(challengeCookie(challengeId, req.headers.get("host")));
  return res;
});
