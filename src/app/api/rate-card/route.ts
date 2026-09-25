import type { RateCard } from "@/lib/fees/rateCard";
import { db, ensureSeed, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => {
  await ensureSeed();
  const rows = must(await db().from("rate_cards").select("id, name, effective_from, is_active, created_at, card").order("created_at", { ascending: false }), "rate cards");
  return Response.json({ cards: rows });
});

/** Save an edited card as a new version and make it active; the old one is kept for comparison. */
export const PUT = handle(async (req: Request) => {
  const { card } = (await req.json()) as { card: RateCard };
  const problems: string[] = [];
  if (!card?.name) problems.push("name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(card?.effectiveFrom ?? "")) problems.push("effectiveFrom (YYYY-MM-DD)");
  if (!(card?.dimDivisor > 0)) problems.push("dimDivisor");
  if (!Array.isArray(card?.tiers) || !card.tiers.length) problems.push("tiers");
  if (!Array.isArray(card?.referral?.categories) || !card.referral.categories.length) problems.push("referral.categories");
  if (problems.length) return Response.json({ error: `Rate card is missing or has a bad ${problems.join(", ")}` }, { status: 400 });
  must(await db().from("rate_cards").update({ is_active: false }).eq("is_active", true), "deactivate");
  must(await db().from("rate_cards").insert({ name: card.name, effective_from: card.effectiveFrom, card, is_active: true }), "save card");
  return Response.json({ ok: true });
});
