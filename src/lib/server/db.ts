import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UK_RATE_CARD_2026_07, type RateCard } from "../fees/rateCard";
import { defaultProfiles, withDefaults, type ProfileConfig } from "../screening/config";
import { DEFAULT_RULES, type CategoryRule } from "../screening/rules";

let client: SupabaseClient | null = null;

/** Service-role client. Every table has RLS on with no policies, so only this key gets in. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** Tests swap in an in-memory double. */
export function __setDbForTests(c: unknown) {
  client = c as SupabaseClient;
  seeded = false;
}

/** Throw on a Supabase error, return the data otherwise. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<T>;
}

let seeded = false;
/** First-run defaults: the three profiles, the compliance rules and the July 2026 rate card. */
export async function ensureSeed(): Promise<void> {
  if (seeded) return;
  const d = db();
  const [profiles, rules, cards] = await Promise.all([
    d.from("profiles").select("id", { count: "exact", head: true }),
    d.from("category_rules").select("id", { count: "exact", head: true }),
    d.from("rate_cards").select("id", { count: "exact", head: true }),
  ]);
  if (!profiles.count) must(await d.from("profiles").insert(defaultProfiles()), "seed profiles");
  if (!rules.count) must(await d.from("category_rules").insert(DEFAULT_RULES), "seed rules");
  if (!cards.count) {
    must(
      await d.from("rate_cards").insert({
        name: UK_RATE_CARD_2026_07.name,
        effective_from: UK_RATE_CARD_2026_07.effectiveFrom,
        card: UK_RATE_CARD_2026_07,
        is_active: true,
      }),
      "seed rate card",
    );
  }
  seeded = true;
}

export async function activeRateCard(): Promise<RateCard> {
  await ensureSeed();
  const res = await db().from("rate_cards").select("card").eq("is_active", true).maybeSingle();
  return (must(res, "rate card")?.card as RateCard | undefined) ?? UK_RATE_CARD_2026_07;
}

export async function loadRules(): Promise<CategoryRule[]> {
  await ensureSeed();
  const rows = must(await db().from("category_rules").select("*").order("sort"), "rules");
  return rows as CategoryRule[];
}

export async function loadProfile(id?: string | null): Promise<{ id: string; name: string; config: ProfileConfig }> {
  await ensureSeed();
  const q = db().from("profiles").select("id, name, config");
  const res = id ? await q.eq("id", id).maybeSingle() : await q.eq("is_default", true).maybeSingle();
  let row = must(res, "profile") as { id: string; name: string; config: ProfileConfig } | null;
  if (!row) row = must(await db().from("profiles").select("id, name, config").limit(1).single(), "profile");
  return { ...row, config: withDefaults(row.config) };
}

/** Split a list into chunks — PostgREST URLs get long with big `in` filters. */
export function chunks<T>(xs: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
