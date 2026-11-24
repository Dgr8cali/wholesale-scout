import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { adsEnv, authorizeUrl, publicOrigin, settingsUrl, STATE_COOKIE } from "@/lib/adsapi/client";

/**
 * Starts the Login with Amazon authorisation: a one-time state in a short cookie, then Amazon's
 * Europe consent page. The cookie is host-only, HttpOnly, SameSite=Lax (Amazon's return is a
 * cross-site top-level GET, which Lax allows and Strict would block), Path=/api/ads (covers the
 * callback), Secure whenever the public origin is https (not guessed from the Host header).
 */
export async function GET() {
  const env = adsEnv();
  if (!env) return NextResponse.redirect(settingsUrl("ads_error=not_configured"));
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(env, state));
  res.cookies.set({ name: STATE_COOKIE, value: state, httpOnly: true, sameSite: "lax", secure: publicOrigin().startsWith("https:"), path: "/api/ads", maxAge: 600 });
  return res;
}
