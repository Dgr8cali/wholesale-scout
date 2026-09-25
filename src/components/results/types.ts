import type { Eta } from "@/lib/eta";
import type { QogitaOffers } from "@/lib/qogita/offers";
import type { GateId, GroupId } from "@/lib/screening/config";
import type { GateOutcome } from "@/lib/screening/gates";
import { buyBox, estSales, profitMonth, sellers, share, type Figure, type StoredMarket } from "@/lib/ui/metrics";

/** Shapes of a run and its results as the run page receives them. */
export interface Result {
  id: string;
  status: "pending" | "done" | "error";
  verdict: "pass" | "warn" | "fail" | null;
  failed_gate: GateId | null;
  gate_outcomes: GateOutcome[];
  fees: {
    source: string; referralCategory: string; referralPct: number; referral: number | null; fba: number | null;
    storage: number | null; returns: number | null; total: number | null; tier: string | null; fbaSource: string;
    dimsEstimated: boolean; outputVat: number | null; dimsSource?: "catalog" | "keepa" | null;
    compare?: {
      amazon: { referral: number | null; fba: number | null } | null;
      keepa: { referral: number | null; fba: number | null } | null;
      rateCard: { referral: number | null; fba: number | null; tier: string | null };
    };
  } | null;
  sell_price: number | null;
  price_source: string | null;
  landed_cost: number | null;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  hurdle_price: number | null;
  score: number | null;
  group_scores: Record<GroupId, number | null> | null;
  why: string | null;
  band: "green" | "amber" | "grey" | null;
  offer_count: number;
  error: string | null;
  inputs: { market?: StoredMarket | null; sellers?: Seller[] | null; qogita?: QogitaOffers | null; maxLandedGbp?: number | null; movMoq?: number; pack?: { listing: number; supplier: number; ratio: number } | null; lookup?: { outcome: string; attempts: { identifiersType: string; code: string; items: number; total?: number; error?: string }[]; raw?: string } | null } | null;
  product: {
    ean: string; asin: string | null; title: string | null; brand: string | null; category: string | null; image_url?: string | null;
    /** From the Chrome extension: competitors' stock, and Seller Central's DG classification. */
    competitor_stock?: { at: string; sellers: { sellerId: string; name: string | null; fba: boolean; stock: number | null; limited: boolean }[] } | null;
    sc_dg?: { at: string; status: "hazmat" | "not_hazmat" | "unknown"; detail: string | null; url: string | null } | null;
  } | null;
  offer: { unit_cost: number; currency: string; unit_cost_gbp: number; cost_known?: boolean; moq: number | null; pack_units: number; stock?: number | null; title: string | null; source_ref: string | null; supplier: { id?: string; name: string } | null } | null;
}

export interface Run {
  id: string; name?: string | null; source: string; status: string; started_at: string; finished_at: string | null;
  row_count: number; processed_count: number; token_cost: number; profile: { name: string } | null; error: string | null;
  profile_snapshot?: Partial<import("@/lib/screening/config").ProfileConfig> | null;
  stats?: import("@/lib/eta").RunStats | null;
}

export interface Seller {
  sellerId: string; sharePct: number; name: string | null; ratingPct: number | null; ratingCount: number | null;
  storefrontSize: number | null; brandSharePct: number | null;
}

export interface Fav {
  id: string;
  ean: string;
  asin: string | null;
  note: string | null;
  /** Watchlist: the flip condition (null: re-check weekly) and whether no supplier is known yet. */
  condition?: import("@/lib/watch").WatchCondition | null;
  no_supplier?: boolean;
}

export interface Progress {
  done: boolean;
  processed: number;
  total: number;
  waiting: { amazon: number; keepa: number };
  keepaResumeAt: string | null;
  eta?: Eta;
  working: boolean;
  tokenCost: number;
  /** A re-screen in progress: rows it hasn't reached yet. */
  rescreen?: { left: number; startedAt: string } | null;
  /** Paused: nothing works on it (and no Keepa tokens go on it) until resumed. */
  paused?: boolean;
  pausedAt?: string | null;
  /** One run uses Keepa at a time: which one, and whether it's this one. */
  keepaTurn?: { owner: { id: string; name: string | null; source: string } | null; mine: boolean };
}


export type SortKey = "score" | "profit" | "roi" | "margin" | "sell_price" | "landed_cost" | "hurdle_price" | "title" | "verdict" | "sales" | "sellers" | "buybox" | "share" | "profitMo" | "orderQty" | "months";

/** Figures computed from the stored market data, for display and sorting. */
const FIGURES = {
  sales: (r: Result) => estSales(r.inputs?.market),
  sellers: (r: Result) => sellers(r.inputs?.market),
  buybox: (r: Result) => buyBox(r.inputs?.market),
  share: (r: Result) => share(r.inputs?.market),
  profitMo: (r: Result) => profitMonth(r.inputs?.market, r.profit),
} as const;
export const figure = (r: Result, k: keyof typeof FIGURES): Figure => FIGURES[k](r);

/** The MOQ in Amazon listings: a multipack listing takes several of the supplier's items. */
export const listingMoq = (r: Result): number | null => {
  // No line MOQ: the units the supplier's minimum order value makes the first order (already per listing).
  if (r.offer?.moq == null && r.inputs?.movMoq != null) return r.inputs.movMoq;
  const moq = r.offer?.moq ?? null, k = r.inputs?.pack;
  return moq == null || !k || k.ratio === 1 ? moq : Math.max(1, Math.ceil(moq / k.ratio));
};

export const titleOf = (r: Result) => r.product?.title ?? r.offer?.title ?? r.product?.ean ?? "";
export const eanOf = (r: Result) => r.product?.ean ?? r.id;
