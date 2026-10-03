import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { addBankTerms, bankAction, keywordBank, removeBankTerm } from "@/lib/server/adsKeywords";

/** ?asin=: the product's keyword bank. */
export const GET = handle(async (req: NextRequest) => {
  try {
    return Response.json(await keywordBank(req.nextUrl.searchParams.get("asin") ?? ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/**
 * { asin, action, terms }: "add" (your own terms), "remove" (one of yours), "exact" / "negative"
 * (queued as approved proposals for the next bulk sheet), "track" (rank checks).
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; action?: string; terms?: string[] | string; note?: string };
  const asin = String(b.asin ?? "");
  const terms = Array.isArray(b.terms) ? b.terms : String(b.terms ?? "").split(/[\n,]/);
  try {
    if (b.action === "add") return Response.json(await addBankTerms(asin, terms, b.note));
    if (b.action === "remove") { await removeBankTerm(asin, terms[0] ?? ""); return Response.json({ ok: true }); }
    if (b.action === "exact" || b.action === "negative" || b.action === "track") return Response.json(await bankAction(asin, b.action, terms));
    return Response.json({ error: "action: add, remove, exact, negative or track" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
