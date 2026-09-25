import type { NextRequest } from "next/server";
import { validQuantity } from "@/lib/qogita/cart";
import { getQogita, QogitaError } from "@/lib/qogita/client";
import { handle } from "@/lib/server/http";

const client = () => {
  const q = getQogita();
  if (!q) throw new QogitaError("Qogita isn't configured: set QOGITA_EMAIL and QOGITA_PASSWORD", 400);
  return q;
};
const fail = (e: unknown) => Response.json({ error: (e as Error).message }, { status: e instanceof QogitaError && e.status < 500 ? 400 : 502 });

/** Add an offer to the cart (added to its line if it's already there). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { offerQid?: string; quantity?: number; unit?: number };
  try {
    if (!b.offerQid) throw new QogitaError("offerQid is required", 400);
    const quantity = validQuantity(b.quantity, b.unit ?? 1);
    await client().addLine(b.offerQid, quantity);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
});

/** Change a line's quantity. */
export const PATCH = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { allocationQid?: string; lineQid?: string; quantity?: number; unit?: number };
  try {
    if (!b.allocationQid || !b.lineQid) throw new QogitaError("allocationQid and lineQid are required", 400);
    await client().updateLine(b.allocationQid, b.lineQid, validQuantity(b.quantity, b.unit ?? 1));
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
});

/** Remove a line. */
export const DELETE = handle(async (req: NextRequest) => {
  const a = req.nextUrl.searchParams.get("allocation"), l = req.nextUrl.searchParams.get("line");
  try {
    if (!a || !l) throw new QogitaError("allocation and line are required", 400);
    await client().deleteLine(a, l);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
});
