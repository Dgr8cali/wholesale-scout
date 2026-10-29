import type { NextRequest } from "next/server";
import { consumeEmailLink } from "@/lib/server/auth";
import { limited, signedIn } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";

/**
 * { token }: use an emailed link. A POST from the page's Continue button, not the link's GET, so a
 * mail scanner that opens links can't use it up.
 */
export const POST = handle(async (req: NextRequest) => {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  const token = String(((await req.json().catch(() => ({}))) as { token?: unknown }).token ?? "");
  const email = token ? await consumeEmailLink(token) : null;
  if (!email) return Response.json({ error: "That link has expired or was already used: ask for a new one." }, { status: 401 });
  return signedIn(req, email, "email");
});
