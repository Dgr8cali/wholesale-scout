import { NextResponse, type NextRequest } from "next/server";
import { revokeSessions, SESSION_COOKIE } from "@/lib/server/auth";
import { currentSession } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";

/** Sign this device out. */
export const POST = handle(async (req: NextRequest) => {
  const s = await currentSession(req);
  if (s) await revokeSessions(s.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
