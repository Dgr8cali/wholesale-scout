import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { adsEnv, authorizeUrl, STATE_COOKIE } from "@/lib/adsapi/client";

/** Starts the Login with Amazon authorisation: a one-time state in a short cookie, then Amazon's Europe consent page. */
export async function GET(req: NextRequest) {
  const env = adsEnv();
  if (!env) return NextResponse.redirect(new URL("/settings?tab=amazon-ads&ads_error=not_configured", req.nextUrl));
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(env, state));
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get("host") ?? "");
  res.cookies.set({ name: STATE_COOKIE, value: state, httpOnly: true, sameSite: "lax", secure: !local, path: "/api/ads", maxAge: 600 });
  return res;
}
