import type { NextRequest } from "next/server";
import { CURRENCIES } from "@/lib/ingest/mapping";
import { gbpRate } from "@/lib/server/fx";
import { handle } from "@/lib/server/http";

/** GBP per 1 unit of `from`, from the ECB reference rates (Frankfurter). */
export const GET = handle(async (req: NextRequest) => {
  const from = (req.nextUrl.searchParams.get("from") ?? "GBP").toUpperCase();
  if (!(CURRENCIES as readonly string[]).includes(from)) return Response.json({ error: `Unsupported currency ${from}` }, { status: 400 });
  const fx = await gbpRate(from);
  return fx ? Response.json(fx) : Response.json({ error: "Couldn't fetch a rate; enter it by hand" }, { status: 502 });
});
