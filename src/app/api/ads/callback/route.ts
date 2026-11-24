import { NextResponse, type NextRequest } from "next/server";
import { adsEnv, exchangeCode, STATE_COOKIE } from "@/lib/adsapi/client";
import { safeEqual } from "@/lib/server/auth";
import { saveRefreshToken } from "@/lib/server/adsConnection";
import { redact } from "@/lib/server/secrets";

/** Amazon sends the browser back here with ?code and ?state: check the state, trade the code for tokens, store the refresh token encrypted. */
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?tab=amazon-ads&${q}`, req.nextUrl));
    res.cookies.set({ name: STATE_COOKIE, value: "", path: "/api/ads", maxAge: 0 });
    return res;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`ads_error=${encodeURIComponent(p.get("error_description")?.slice(0, 120) || p.get("error")!.slice(0, 60))}`);
  const want = req.cookies.get(STATE_COOKIE)?.value, got = p.get("state"), code = p.get("code");
  if (!want || !got || !safeEqual(want, got) || !code) return back("ads_error=state_mismatch");
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
