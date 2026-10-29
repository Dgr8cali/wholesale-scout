import type { NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { CHALLENGE_COOKIE, limited, refused, signedIn } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";
import { verifyLogin } from "@/lib/server/passkeys";

/** Step 2: the signed challenge. A registered passkey of an allowed account starts a session. */
export const POST = handle(async (req: NextRequest) => {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  const body = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!body?.id) return Response.json({ error: "No passkey response" }, { status: 400 });
  try {
    const key = await verifyLogin(body, req.cookies.get(CHALLENGE_COOKIE)?.value, req.nextUrl.origin);
    return await signedIn(req, key.email, "passkey", key.id);
  } catch (e) {
    return refused(e);
  }
});
