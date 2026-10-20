import "server-only";
import type { NextRequest } from "next/server";
import type { Who } from "./askScoutActions";

/**
 * Who made a request, for the action log: the user name typed at the browser's sign-in (only the
 * part before the colon; the password is never read), else "app password" for a bearer token; the
 * address and the browser.
 */
export function whoOf(req: Pick<NextRequest, "headers">): Who {
  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  let actor = scheme === "Bearer" ? "app password (script or extension)" : "you (signed in)";
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const user = decoded.slice(0, Math.max(0, decoded.indexOf(":"))).trim();
      if (user) actor = user.slice(0, 60);
    } catch { /* not base64 */ }
  }
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  return { actor, ip, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null };
}
