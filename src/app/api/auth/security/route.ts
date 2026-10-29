import type { NextRequest } from "next/server";
import { browserName, listApiTokens, listPasskeys, listSessions } from "@/lib/server/auth";
import { currentSession } from "@/lib/server/authRoutes";
import { handle } from "@/lib/server/http";

/** Settings → Security: signed-in devices, passkeys and extension tokens (never a secret or a hash). */
export const GET = handle(async (req: NextRequest) => {
  const [me, sessions, passkeys, tokens] = await Promise.all([currentSession(req), listSessions(), listPasskeys(), listApiTokens()]);
  const keyName = new Map(passkeys.map((p) => [p.id, p.name]));
  return Response.json({
    sessions: sessions.map((s) => ({
      id: s.id, device: browserName(s.user_agent), method: s.method, passkey: s.passkey_id ? keyName.get(s.passkey_id) ?? null : null,
      ip: s.ip, created_at: s.created_at, last_seen_at: s.last_seen_at, expires_at: s.expires_at, current: s.id === me?.id,
    })),
    passkeys: passkeys.map((p) => ({ id: p.id, name: p.name, synced: p.device_type === "multiDevice" || !!p.backed_up, created_at: p.created_at, last_used_at: p.last_used_at })),
    tokens: tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, created_at: t.created_at, last_used_at: t.last_used_at, last_ip: t.last_ip })),
  });
});
