import { NextResponse, type NextRequest } from "next/server";
import { adsEnv, checkState, exchangeCode, settingsUrl, STATE_COOKIE } from "@/lib/adsapi/client";
import { safeEqual } from "@/lib/server/auth";
import { saveRefreshToken } from "@/lib/server/adsConnection";
import { redact } from "@/lib/server/secrets";

/**
 * Amazon sends the browser back here with ?code and ?state: check the state against the cookie,
 * trade the code for tokens, store the refresh token encrypted. The state cookie is cleared on
 * every outcome, so a state works once. Redirects go to the public origin.
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(settingsUrl(q));
    res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/ads", maxAge: 0 });
    return res;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`ads_error=${encodeURIComponent(p.get("error_description")?.slice(0, 120) || p.get("error")!.slice(0, 60))}`);
  const code = p.get("code");
  const state = checkState(req.cookies.get(STATE_COOKIE)?.value, p.get("state"), safeEqual);
  if (state !== "ok" || !code) {
    // Names only, never values: which cookies the browser sent tells a missing state cookie from a different state.
    console.warn(`Amazon Ads callback refused: ${state}${code ? "" : " (no code)"}; cookies sent: ${req.cookies.getAll().map((c) => c.name).join(", ") || "none"}`);
    return back(`ads_error=${state === "no_cookie" ? "state_cookie_missing" : "state_mismatch"}`);
  }
  const env = adsEnv();
  if (!env) return back("ads_error=not_configured");
  try {
    const { refreshToken } = await exchangeCode(env, code);
    await saveRefreshToken(refreshToken);
    return back("ads_connected=1");
  } catch (e) {
    console.error(redact((e as Error).message));
    return back(`ads_error=${encodeURIComponent(redact((e as Error).message).slice(0, 160))}`);
  }
}
