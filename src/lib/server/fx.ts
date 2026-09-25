import "server-only";

/** GBP per 1 unit of `from`, from the ECB reference rates (Frankfurter). null if neither source answers. */
export async function gbpRate(from: string): Promise<{ rate: number; date: string; source: string } | null> {
  if (from === "GBP") return { rate: 1, date: new Date().toISOString().slice(0, 10), source: "fixed" };
  const sources = [
    `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=GBP`,
    `https://api.frankfurter.app/latest?from=${from}&to=GBP`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const body = (await res.json()) as { date: string; rates: { GBP?: number } };
      if (body.rates?.GBP) return { rate: body.rates.GBP, date: body.date, source: "ECB via Frankfurter" };
    } catch {
      // try the next source
    }
  }
  return null;
}
