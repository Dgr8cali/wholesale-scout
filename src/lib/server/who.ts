import "server-only";
import type { NextRequest } from "next/server";
import type { Who } from "./askScoutActions";

/**
 * Who made a request, for the action log: how the proxy let it in (a passkey session, an email
 * link, an extension token, the fallback password; it sets x-ws-auth and drops any the client
 * sent), the address and the browser. Never a secret.
 */
export function whoOf(req: Pick<NextRequest, "headers">): Who {
  const actor = (req.headers.get("x-ws-auth") ?? "").slice(0, 80) || "you (signed in)";
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  return { actor, ip, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null };
}
