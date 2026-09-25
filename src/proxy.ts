import { NextResponse, type NextRequest } from "next/server";

/**
 * Password gate until Supabase Auth lands. Set APP_PASSWORD in Vercel; the browser asks
 * once (any username). Without it, production refuses to serve, because the app can
 * call your seller account's SP-API.
 */
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Set APP_PASSWORD in the Vercel project to open Wholesale Scout.", { status: 503 });
    }
    return NextResponse.next();
  }
  const auth = req.headers.get("authorization") ?? "";
  // Vercel Cron can't send the password; it sends the CRON_SECRET as a bearer token instead.
  // The watchdog (Supabase pg_cron) uses its own WATCHDOG_SECRET the same way.
  if (req.nextUrl.pathname.startsWith("/api/cron/")) {
    for (const secret of [process.env.CRON_SECRET, process.env.WATCHDOG_SECRET]) {
      if (secret && auth.length === secret.length + 7 && timingSafeEqual(auth, `Bearer ${secret}`)) return NextResponse.next();
    }
  }
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given.length === password.length && timingSafeEqual(given, password)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Wholesale Scout", charset="UTF-8"' },
  });
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
