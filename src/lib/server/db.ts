import "server-only";
import type { IpRiskBrand } from "../ipRisk";
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
  seeding = null;
  client = c as SupabaseClient;
}

/** A query failed because a table or column isn't there yet (a migration not run). */
export const schemaMissing = (msg: string) => /does not exist|could not find the .* (column|table)|could not find|schema cache/i.test(msg);

/** Throw on a Supabase error, return the data otherwise. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<T>;
}

let seeding: Promise<void> | null = null;
/**
 * First-run defaults: the three profiles, the compliance rules and the July 2026 rate card.
 * Concurrent callers share one pass, so the defaults are never inserted twice.
 */
export function ensureSeed(): Promise<void> {
  seeding ??= seed().catch((e) => {
    seeding = null;
    throw e;
  });
  return seeding;
}

async function seed(): Promise<void> {
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

/** Your IP-risk brand list; empty before its migration. */
export async function loadIpRisk(): Promise<IpRiskBrand[]> {
  const res = await db().from("ip_risk_brands").select("id, brand, aliases, level, note, source, reported_on, updated_at").order("brand");
  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message)) return [];
    throw new Error(`IP-risk brands: ${res.error.message}`);
  }
  return (res.data ?? []) as IpRiskBrand[];
}

export async function loadProfile(id?: string | null): Promise<{ id: string; name: string; config: ProfileConfig; updated_at?: string | null }> {
  await ensureSeed();
  const q = db().from("profiles").select("id, name, config, updated_at");
  const res = id ? await q.eq("id", id).maybeSingle() : await q.eq("is_default", true).maybeSingle();
  let row = must(res, "profile") as { id: string; name: string; config: ProfileConfig } | null;
  if (!row) row = must(await db().from("profiles").select("id, name, config, updated_at").limit(1).single(), "profile");
  return { ...row, config: withDefaults(row.config) };
}

/** Split a list into chunks — PostgREST URLs get long with big `in` filters. */
/** PostgREST returns at most this many rows a request (Supabase's max-rows), whatever the range asked for. */
export const MAX_ROWS = 1000;

/**
 * Every row of a query, a page at a time: a single select stops at MAX_ROWS. The query must have a
 * stable order (a unique column last, such as id) so pages don't overlap or skip rows.
 */
export async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  // A page can come back shorter than asked (a lower max-rows setting): step on by what came, and
  // stop only at an empty page, so a smaller cap never cuts the list short.
  const out: T[] = [];
  for (let from = 0; ; ) {
    const page = must(await query(from, from + MAX_ROWS - 1), what) as T[];
    if (!page.length) break;
    out.push(...page);
    from += page.length;
  }
  return out;
}

/** A select being built (PostgREST's builder; its generics are too deep to spell out here). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Selected = any;

/**
 * Every row of a table (filtered by `where` when given), a page at a time, ordered by `order` (a
 * unique key, last column unique: the table's primary key) so the pages line up.
 */
export function selectAll<T>(table: string, cols: string, order: string[], where?: (q: Selected) => Selected): Promise<T[]> {
  return allRows<T>((a, b) => {
    let q: Selected = db().from(table).select(cols);
    if (where) q = where(q);
    for (const o of order) q = q.order(o);
    return q.range(a, b);
  }, table);
}

export function chunks<T>(xs: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
