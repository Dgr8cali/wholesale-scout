/**
 * Supplier Scout's RFQ: a message for the top suppliers, from a template (editable in Settings →
 * Private label) and the candidate. {{placeholders}} are filled from the candidate; a line with an
 * empty one (no six words yet, no target price, no spec) is left out. Pure.
 */

export const RFQ_PLACEHOLDERS = {
  product: "the product (the niche keyword, else the candidate's name)",
  sixWords: "Gate 4's six words",
  targetPrice: "the target ex-works price, £ (Gate 6)",
  unit: "one unit of our product (Gate 6: box, piece…)",
  maxMoq: "the most you'd order first (Gate 6)",
  moq2x: "twice that",
  spec: "the spec for suppliers (Gate 6)",
} as const;
export type RfqVars = Record<keyof typeof RFQ_PLACEHOLDERS, string>;

export const DEFAULT_RFQ_TEMPLATE = `Hello,

I'm sourcing {{product}} to sell under my own brand on Amazon UK, and I'd like a quote.

What makes ours different: {{sixWords}}
Target price: £{{targetPrice}} per {{unit}}, ex-works
First order: up to {{maxMoq}} units

Specification: {{spec}}

Please send:
- FOB price at your MOQ and at 2× MOQ (about {{moq2x}} units)
- Unit weight
- Carton dimensions, units per carton and carton weight
- Production lead time after the deposit
- Sample cost, delivered to the UK
- SDS, REACH and any test reports for this product

Are you the factory or a trading company?

Thank you.`;

/** The template with the candidate's values in; a line with an empty or unknown placeholder dropped. */
export function renderRfq(template: string, vars: Partial<RfqVars>): string {
  const out: string[] = [];
  for (const line of template.replace(/\r/g, "").split("\n")) {
    const keys = [...line.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const val = (k: string) => (vars as Record<string, string | undefined>)[k]?.trim() ?? "";
    if (keys.some((k) => !val(k))) continue;
    out.push(line.replace(/\{\{(\w+)\}\}/g, (_, k: string) => val(k)));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The values from a candidate: its name, niche keyword and fields. */
export function rfqVars(c: { name: string; niche_keyword: string | null }, f: Record<string, string | undefined>, target: number | null, maxMoq: number, unit: string): RfqVars {
  return {
    product: c.niche_keyword?.trim() || c.name,
    sixWords: f.sixWordsText ?? "",
    targetPrice: target != null ? target.toFixed(2) : "",
    unit,
    maxMoq: maxMoq.toLocaleString("en-GB"),
    moq2x: (maxMoq * 2).toLocaleString("en-GB"),
    spec: f.spec ?? "",
  };
}
