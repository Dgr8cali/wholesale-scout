import type { NextRequest } from "next/server";
import { CURRENCIES } from "@/lib/ingest/mapping";
import { handle } from "@/lib/server/http";

/** GBP per 1 unit of `from`, from the ECB reference rates (Frankfurter). */
export const GET = handle(async (req: NextRequest) => {
  const from = (req.nextUrl.searchParams.get("from") ?? "GBP").toUpperCase();
  if (!(CURRENCIES as readonly string[]).includes(from)) return Response.json({ error: `Unsupported currency ${from}` }, { status: 400 });
  if (from === "GBP") return Response.json({ rate: 1, date: new Date().toISOString().slice(0, 10), source: "fixed" });
  const sources = [
    `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=GBP`,
    `https://api.frankfurter.app/latest?from=${from}&to=GBP`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const body = (await res.json()) as { date: string; rates: { GBP?: number } };
      if (body.rates?.GBP) return Response.json({ rate: body.rates.GBP, date: body.date, source: "ECB via Frankfurter" });
    } catch {
      // try the next source
    }
  }
  return Response.json({ error: "Couldn't fetch a rate; enter it by hand" }, { status: 502 });
});
