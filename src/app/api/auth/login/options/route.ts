import { NextResponse, type NextRequest } from "next/server";
import { challengeCookie } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";
import { loginOptions } from "@/lib/server/passkeys";

/** Step 1 of a passkey sign-in: the challenge for the device to sign. */
export const POST = handle(async (req: NextRequest) => {
  const { options, challengeId } = await loginOptions(req.nextUrl.origin);
  const res = NextResponse.json(options);
  res.cookies.set(challengeCookie(challengeId, req.headers.get("host")));
  return res;
});
