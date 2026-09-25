/** Turning a stored result (with its product, offer and inputs) into what filters read. */
import type { Approval, FilterRow, Verdict } from "../filters";
import { estSales, sellers, type StoredMarket } from "./metrics";

export interface ResultLike {
  status: string;
  verdict: "pass" | "warn" | "fail" | null;
  band: string | null;
  failed_gate: string | null;
  sell_price: number | null;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  why: string | null;
  error?: string | null;
  gate_outcomes: { gate: string; status: string; tags?: string[] }[] | null;
  inputs: { market?: StoredMarket | null; restriction?: { status: string } | null } | null;
  product: { ean: string; asin: string | null; title: string | null; brand: string | null } | null;
  offer: { title?: string | null; brand?: string | null; supplier: { name: string } | null } | null;
}

/** Favourites are per product: EAN + ASIN, whichever run the row is from. */
export const favKey = (ean: string, asin: string | null | undefined) => `${ean}/${asin ?? ""}`;

export const brandOf = (r: ResultLike) => r.product?.brand || r.offer?.brand || null;

function amazonOnListing(r: ResultLike): "yes" | "no" | null {
  const g = r.gate_outcomes?.find((o) => o.gate === "amazonPresence");
  if (g?.tags?.includes("AMAZON")) return "yes";
  if (g?.status === "pass") return "no";
  return null;
}

function approvalOf(r: ResultLike): Approval | null {
  const g = r.gate_outcomes?.find((o) => o.gate === "gating");
  if (g?.tags?.includes("BRAND_APPROVED")) return "open";
  const s = r.inputs?.restriction?.status;
  return s === "open" || s === "approval_required" || s === "blocked" ? s : null;
}

export function toFilterRow(r: ResultLike, favourites: Set<string>): FilterRow {
  const m = r.inputs?.market;
  return {
    verdict: (r.status === "error" ? "error" : r.verdict) as Verdict | null,
    band: r.band,
    failedGate: r.failed_gate,
    brand: brandOf(r),
    supplier: r.offer?.supplier?.name ?? null,
    amazon: amazonOnListing(r),
    approval: approvalOf(r),
    favourite: !!r.product && favourites.has(favKey(r.product.ean, r.product.asin)),
    values: {
      sales: estSales(m).value,
      sellers: sellers(m).value,
      profit: r.profit,
      roi: r.roi,
      margin: r.margin,
      sell: r.sell_price,
    },
    text: [r.product?.title, r.offer?.title, brandOf(r), r.product?.ean, r.product?.asin, r.offer?.supplier?.name, r.why, r.error].filter(Boolean).join(" "),
  };
}
