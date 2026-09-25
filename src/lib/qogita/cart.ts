import type { Money, QogitaClient } from "./client";

export interface CartLine {
  qid: string;
  offerQid: string | null;
  name: string;
  gtin: string | null;
  quantity: number;
  /** Case size: quantities go up in these steps. */
  unit: number;
  availableQuantity: number | null;
  price: Money | null;
  subtotal: Money | null;
  warnings: string[];
}
export interface CartAllocation {
  qid: string;
  fid: string;
  mov: Money;
  subtotal: Money;
  /** 0–1 of the way to the supplier's minimum order. */
  movProgress: number;
  isMovMet: boolean;
  deliveryWeeks: number | null;
  lines: CartLine[];
}

const WARNINGS: Record<string, string> = { PRICE_DECREASED: "price went down", PRICE_INCREASED: "price went up", OUT_OF_STOCK: "out of stock", QUANTITY_REDUCED: "quantity reduced" };

/** The active cart as allocations (one per supplier), each with its lines. */
export async function cartView(q: QogitaClient): Promise<CartAllocation[]> {
  const allocations = await q.allocations();
  return Promise.all(allocations.map(async (a) => {
    const lines = await q.allocationLines(a.fid);
    return {
      qid: a.qid, fid: a.fid, mov: a.mov, subtotal: a.subtotal,
      movProgress: Math.min(1, Number(a.movProgress) || 0), isMovMet: !!a.isMovMet, deliveryWeeks: a.estimatedDeliveryTime ?? null,
      lines: lines.map((l) => {
        const v = (l.variant ?? {}) as { name?: string; gtin?: string };
        const w = ((l.warnings ?? []) as { status: string; previousValue?: string }[]).map((x) => `${WARNINGS[x.status] ?? x.status.toLowerCase().replace(/_/g, " ")}${x.previousValue ? ` (was ${x.previousValue})` : ""}`);
        return {
          qid: l.qid, offerQid: l.offerQid ?? null, name: v.name ?? "Product", gtin: v.gtin ?? null, quantity: l.quantity,
          unit: Math.max(1, Number(l.unit) || 1), availableQuantity: (l.availableQuantity as number | undefined) ?? null,
          price: (l.activeTierPrice as Money | undefined) ?? (l.baseTierPrice as Money | undefined) ?? null,
          subtotal: (l.subtotal as Money | undefined) ?? null, warnings: w,
        };
      }),
    };
  }));
}

/**
 * The most you can order within a budget: whole cases at this landed cost, no more than the
 * supplier holds, and at least one case.
 */
export function quantityForBudget(budgetGbp: number, landedPerUnitGbp: number | null, unit: number, inventory: number): number {
  const u = Math.max(1, unit);
  const cap = Math.floor(inventory / u) * u;
  if (!landedPerUnitGbp || landedPerUnitGbp <= 0) return Math.min(u, cap || u);
  const fit = Math.floor(budgetGbp / landedPerUnitGbp / u) * u;
  return Math.max(u, Math.min(fit, cap || u));
}

/** A quantity Qogita will take for this line: a positive whole number of cases. */
export function validQuantity(q: unknown, unit: number): number {
  const n = Number(q);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Quantity must be a whole number above zero");
  if (n % Math.max(1, unit) !== 0) throw new Error(`Quantity must be a multiple of the case size (${unit})`);
  return n;
}
