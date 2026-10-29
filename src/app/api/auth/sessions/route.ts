import { NextResponse } from "next/server";
import { revokeSessions, SESSION_COOKIE } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

/** Sign out everywhere: every device's session, this one too. */
export const DELETE = handle(async () => {
  await revokeSessions();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
