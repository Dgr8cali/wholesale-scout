import { NextResponse, type NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { CHALLENGE_COOKIE, refused } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";
import { registerPasskey } from "@/lib/server/passkeys";

/** Step 2: { response, name? } from the device; the passkey is saved (named after the device unless given). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { response?: RegistrationResponseJSON; name?: string };
  if (!b.response?.id) return Response.json({ error: "No passkey response" }, { status: 400 });
  try {
    const key = await registerPasskey(b.response, req.cookies.get(CHALLENGE_COOKIE)?.value, req.nextUrl.origin, b.name ?? null, req.headers.get("user-agent"));
    const res = NextResponse.json({ passkey: { id: key.id, name: key.name } });
    res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
    return res;
  } catch (e) {
    return refused(e, 400);
  }
});
