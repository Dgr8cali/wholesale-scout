import { money } from "./format";
/**
 * Order planner: which products to buy, how many, from whom, to make the most profit a month
 * within the budget. Each line stays within the line cap and sells within the months limit at
 * your share; MOQs and case sizes are respected; a supplier is only ordered from if its lines
 * reach its MOV. Pure and fast, so the page recomputes as you pin, exclude or change quantities.
 *
 * It's a heuristic, not an exact optimum: lines are taken by profit a month per £ spent, then
 * suppliers short of their MOV are topped up from their own products or dropped and the budget
 * refilled from the rest.
 */

export interface PlanCandidate {
  /** One product from one supplier. */
  key: string;
  productId: string;
  ean: string;
  asin: string | null;
  title: string | null;
  brand: string;
  /** A supplier id, or "qogita:<seller>" (each Qogita seller is its own order and MOV). */
  supplierKey: string;
  supplierName: string;
  supplierId: string | null;
  /** Minimum order value in GBP, on goods ex-VAT; null for none. */
  movGbp: number | null;
  unitCostGbp: number;
  landedGbp: number;
  profitUnit: number;
  sellPrice: number;
  shareMonth: number | null;
  moq: number | null;
  /** Order multiple (a Qogita case). */
  step: number;
  /** Most available (supplier stock), when known. */
  maxUnits: number | null;
  verdict: "pass" | "warn";
  /** Gates that warned (on the default profile). */
  warnGates?: string[];
  /** Warns only because it needs brand approval: listed separately, not planned. */
  approvalOnly: boolean;
  qogita?: { qid: string; unit: number } | null;
}

export interface PlanLimits {
  budget: number;
  lineCap: number;
  maxMonths: number;
}

export interface PlanControls {
  pinned: Set<string>;
  excluded: Set<string>;
  /** Your quantities, by candidate key. */
  qty: Map<string, number>;
}

export interface PlanLine {
  c: PlanCandidate;
  qty: number;
  lineTotal: number;
  months: number | null;
  profitMonth: number;
  pinned: boolean;
  /** Where your quantity breaks a limit: "over the line cap", "sells in 4.2 months, over 3". */
  notes: string[];
}

export interface PlanGroup {
  supplierKey: string;
  name: string;
  supplierId: string | null;
  movGbp: number | null;
  /** Goods value ex-VAT (what MOV is measured on), and landed. */
  goods: number;
  landed: number;
  movMet: boolean;
  lines: PlanLine[];
}

export interface Plan {
  groups: PlanGroup[];
  total: number;
  profitMonth: number;
  /** Months for sales to bring the outlay back (at your share, proceeds per unit). */
  paybackMonths: number | null;
  left: number;
  /** Candidates not planned, and why. */
  skipped: { c: PlanCandidate; reason: string }[];
}

const round = (n: number, step: number) => Math.floor(n / step) * step;

/** The quantity a line would take on its own, or why it can't be bought. */
export function lineQty(c: PlanCandidate, l: PlanLimits): { qty: number } | { reason: string } {
  if (c.shareMonth == null || c.shareMonth <= 0) return { reason: "no sales share to size an order" };
  const step = Math.max(1, c.step);
  const floor = Math.max(step, c.moq ?? 1);
  const byCap = Math.floor(l.lineCap / c.landedGbp);
  const byMonths = Math.floor(c.shareMonth * l.maxMonths);
  let qty = round(Math.min(byCap, byMonths, c.maxUnits ?? Infinity), step);
  if (qty < floor) {
    if (floor * c.landedGbp > l.lineCap) return { reason: `MOQ ${floor} × ${money(c.landedGbp)} is over the ${money(l.lineCap)} line cap` };
    if (floor > byMonths) return { reason: `MOQ ${floor} takes ${(floor / c.shareMonth).toFixed(1)} months to sell, over ${l.maxMonths}` };
    if (c.maxUnits != null && floor > c.maxUnits) return { reason: `only ${c.maxUnits} in stock, under the MOQ ${floor}` };
    qty = floor;
  }
  return { qty };
}

function makeLine(c: PlanCandidate, l: PlanLimits, ctl: PlanControls): PlanLine | { reason: string } {
  const pinned = ctl.pinned.has(c.key);
  const own = ctl.qty.get(c.key);
  const auto = lineQty(c, l);
  let qty: number;
  const notes: string[] = [];
  if (own != null && own > 0) {
    const step = Math.max(1, c.step);
    qty = Math.max(Math.max(step, c.moq ?? 1), Math.ceil(own / step) * step);
    if (qty !== own) notes.push(`raised to ${qty} (MOQ / case of ${step})`);
  } else if ("qty" in auto) {
    qty = auto.qty;
    if (c.maxUnits != null && qty >= c.maxUnits && c.maxUnits < Math.floor(l.lineCap / c.landedGbp)) notes.push(`only ${c.maxUnits} in stock`);
  } else if (pinned) {
    qty = Math.max(Math.max(1, c.step), c.moq ?? 1);
    notes.push(auto.reason);
  } else {
    return auto;
  }
  const lineTotal = qty * c.landedGbp;
  const months = c.shareMonth ? qty / c.shareMonth : null;
  if (lineTotal > l.lineCap + 0.005) notes.push(`${money(lineTotal)}, over the ${money(l.lineCap)} line cap`);
  if (months != null && months > l.maxMonths + 1e-9) notes.push(`sells in ${months.toFixed(1)} months, over ${l.maxMonths}`);
  // A month's profit: your share of sales, but never more units than were bought.
  return { c, qty, lineTotal, months, profitMonth: Math.min(c.shareMonth ?? 0, qty) * c.profitUnit, pinned, notes };
}

export function planOrder(candidates: PlanCandidate[], l: PlanLimits, ctl: PlanControls): Plan {
  const skipped: Plan["skipped"] = [];
  const lines: PlanLine[] = [];
  for (const c of candidates) {
    if (ctl.excluded.has(c.key)) { skipped.push({ c, reason: "excluded by you" }); continue; }
    if (c.approvalOnly && !ctl.pinned.has(c.key)) continue; // listed separately
    if (c.profitUnit <= 0) { skipped.push({ c, reason: "no profit at this supplier's price" }); continue; }
    const line = makeLine(c, l, ctl);
    if ("reason" in line) skipped.push({ c, reason: line.reason });
    else lines.push(line);
  }
  const ratio = (x: PlanLine) => x.profitMonth / x.lineTotal;
  const order = [...lines].sort((a, b) => ratio(b) - ratio(a));

  const chosen = new Map<string, PlanLine>(); // by product
  let spent = 0;
  const add = (x: PlanLine) => { chosen.set(x.c.productId, x); spent += x.lineTotal; };
  const drop = (x: PlanLine) => { chosen.delete(x.c.productId); spent -= x.lineTotal; };
  // Pinned lines always go in (the budget may end up over; the totals say so).
  for (const x of order.filter((x) => x.pinned)) if (!chosen.has(x.c.productId)) add(x);
  const blocked = new Set<string>();
  const fill = () => {
    for (const x of order) {
      if (chosen.has(x.c.productId) || blocked.has(x.c.supplierKey)) continue;
      if (spent + x.lineTotal > l.budget + 0.005) continue;
      add(x);
    }
  };
  fill();
  const goodsOf = (key: string) => [...chosen.values()].filter((x) => x.c.supplierKey === key).reduce((a, x) => a + x.qty * x.c.unitCostGbp, 0);
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const key of new Set([...chosen.values()].map((x) => x.c.supplierKey))) {
      const mov = [...chosen.values()].find((x) => x.c.supplierKey === key)?.c.movGbp;
      if (mov == null || goodsOf(key) >= mov) continue;
      // Top up from the same supplier's other products, best first.
      for (const x of order) {
        if (x.c.supplierKey !== key || chosen.has(x.c.productId) || spent + x.lineTotal > l.budget + 0.005) continue;
        add(x);
        if (goodsOf(key) >= mov) break;
      }
      if (goodsOf(key) >= mov) continue;
      // Can't reach it: drop the supplier (pinned lines stay, flagged) and spend elsewhere.
      const mine = [...chosen.values()].filter((x) => x.c.supplierKey === key);
      if (mine.some((x) => x.pinned)) continue;
      mine.forEach(drop);
      blocked.add(key);
      changed = true;
    }
    if (!changed) break;
    fill();
  }
  for (const x of lines) {
    if (chosen.get(x.c.productId) === x) continue;
    const other = chosen.get(x.c.productId);
    skipped.push({
      c: x.c,
      reason: other ? `bought from ${other.c.supplierName} instead`
        : blocked.has(x.c.supplierKey) ? `${x.c.supplierName}'s MOV ${money(x.c.movGbp ?? 0)} not reachable within the budget`
        : "doesn't fit the budget",
    });
  }

  const groups = new Map<string, PlanGroup>();
  for (const x of chosen.values()) {
    const g = groups.get(x.c.supplierKey) ?? { supplierKey: x.c.supplierKey, name: x.c.supplierName, supplierId: x.c.supplierId, movGbp: x.c.movGbp, goods: 0, landed: 0, movMet: true, lines: [] };
    g.lines.push(x);
    g.goods += x.qty * x.c.unitCostGbp;
    g.landed += x.lineTotal;
    groups.set(x.c.supplierKey, g);
  }
  for (const g of groups.values()) {
    g.movMet = g.movGbp == null || g.goods >= g.movGbp - 0.005;
    g.lines.sort((a, b) => b.profitMonth - a.profitMonth);
  }
  const total = [...chosen.values()].reduce((a, x) => a + x.lineTotal, 0);
  const profitMonth = [...chosen.values()].reduce((a, x) => a + x.profitMonth, 0);
  // Cash back a month: each unit sold returns its landed cost and its profit.
  const cashMonth = [...chosen.values()].reduce((a, x) => a + Math.min(x.c.shareMonth ?? 0, x.qty) * (x.c.landedGbp + x.c.profitUnit), 0);
  return {
    groups: [...groups.values()].sort((a, b) => b.landed - a.landed),
    total,
    profitMonth,
    paybackMonths: cashMonth > 0 ? total / cashMonth : null,
    left: l.budget - total,
    skipped,
  };
}
