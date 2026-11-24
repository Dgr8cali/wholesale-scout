import type { NextRequest } from "next/server";
import { adsEnv, isUk, listProfiles } from "@/lib/adsapi/client";
import { adsSession, connectionStatus, disconnect, saveProfile } from "@/lib/server/adsConnection";
import { handle } from "@/lib/server/http";

/** Status; with ?profiles=1 also the advertiser profiles on the Europe host, for choosing the UK one. */
export const GET = handle(async (req: NextRequest) => {
  const status = await connectionStatus();
  const base = { ...status, configured: !!adsEnv() };
  if (!status.connected || req.nextUrl.searchParams.get("profiles") !== "1") return Response.json(base);
  try {
    const { env, token } = await adsSession();
    const profiles = (await listProfiles(env, token)).map((p) => ({ ...p, uk: isUk(p) }));
    return Response.json({ ...base, profiles });
  } catch (e) {
    return Response.json({ ...base, profiles: [], profilesError: (e as Error).message });
  }
});

/** { profileId }: the profile to use (it must be one Amazon lists for this connection). */
export const PUT = handle(async (req: NextRequest) => {
  const { profileId } = (await req.json().catch(() => ({}))) as { profileId?: string };
  const { env, token } = await adsSession();
  const p = (await listProfiles(env, token)).find((x) => x.profileId === String(profileId));
  if (!p) return Response.json({ error: "That profile isn't on this Amazon Ads connection" }, { status: 400 });
  await saveProfile({ profileId: p.profileId, name: p.name, country: p.country });
  return Response.json(await connectionStatus());
});

export const DELETE = handle(async () => { await disconnect(); return Response.json({ ok: true }); });
