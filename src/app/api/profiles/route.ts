import { DEFAULT_PROFILE, invalidNumbers, withDefaults, type ProfileConfig } from "@/lib/screening/config";
import { db, ensureSeed, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => {
  await ensureSeed();
  const rows = must(await db().from("profiles").select("id, name, config, is_default, updated_at").order("name"), "profiles") as
    { id: string; name: string; config: ProfileConfig; is_default: boolean }[];
  return Response.json({ profiles: rows.map((p) => ({ ...p, config: withDefaults(p.config) })) });
});

/** Create a profile: from another (duplicate), from a given config, or from the defaults. */
export const POST = handle(async (req: Request) => {
  const body = (await req.json()) as { name?: string; fromId?: string; config?: ProfileConfig };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
  let config = body.config ?? DEFAULT_PROFILE;
  if (body.fromId) {
    const src = must(await db().from("profiles").select("config").eq("id", body.fromId).single(), "source profile") as { config: ProfileConfig };
    config = src.config;
  }
  const bad = invalidNumbers(withDefaults(config));
  if (bad.length) return Response.json({ error: `These settings need a number: ${bad.join(", ")}` }, { status: 400 });
  const res = await db().from("profiles").insert({ name, config: withDefaults(config) }).select("id").single();
  if (res.error?.code === "23505") return Response.json({ error: `A profile called "${name}" already exists` }, { status: 409 });
  return Response.json(must(res, "create profile"));
});
