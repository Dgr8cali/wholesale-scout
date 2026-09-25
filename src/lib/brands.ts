/**
 * Brands page: every "approval needed" result grouped by brand, with how many of its
 * products clear the fee engine and where the approval stands.
 */
import { applyLinks, approvalKind } from "./spapi/parse";
import type { RestrictionLink } from "./spapi/types";

export const APPROVAL_STATUSES = ["not_applied", "applied", "approved", "refused"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  approved: "Approved",
  refused: "Refused",
};

/** One key per brand however it's written: "La Roche-Posay" = "LA ROCHE POSAY" = "la roche posay". */
export function brandKey(brand: string | null | undefined): string {
  return (brand ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface BrandApproval {
  brand_key: string;
  brand: string;
  status: ApprovalStatus;
  requirement: string | null;
  status_date: string | null;
}

/** The slice of a result the grouping needs. */
export interface ApprovalResult {
  product_id: string;
  updated_at: string;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  gate_outcomes: { gate: string; status: string; links?: RestrictionLink[] }[];
  inputs: { restriction?: { status: string; message: string; links?: RestrictionLink[] } | null } | null;
  product: { asin: string | null; ean: string; title: string | null; brand: string | null } | null;
  offer: { brand: string | null } | null;
  /** The fee floors of the run's profile. */
  floors: { minProfit: number; minRoiPct: number; minMarginPct: number };
}

export interface BrandRow {
  key: string;
  brand: string;
  kinds: string[];
  products: { asin: string | null; ean: string; title: string | null; passesFees: boolean }[];
  passFees: number;
  applyUrl: string | null;
  applyTitle: string | null;
  approval: BrandApproval | null;
}

/** Whether a result clears the fee engine: the fee gate's own verdict, else its numbers vs the floors. */
export function passesFees(r: ApprovalResult): boolean {
  const fee = r.gate_outcomes.find((o) => o.gate === "fees");
  if (fee && fee.status !== "skipped" && fee.status !== "off") return fee.status === "pass";
  return r.profit != null && r.roi != null && r.margin != null &&
    r.profit >= r.floors.minProfit && r.roi >= r.floors.minRoiPct && r.margin >= r.floors.minMarginPct;
}

export function groupApprovals(results: ApprovalResult[], approvals: BrandApproval[]): BrandRow[] {
  // Latest result per product, across runs.
  const latest = new Map<string, ApprovalResult>();
  for (const r of results) {
    const cur = latest.get(r.product_id);
    if (!cur || r.updated_at > cur.updated_at) latest.set(r.product_id, r);
  }
  const byKey = new Map(approvals.map((a) => [a.brand_key, a]));
  const rows = new Map<string, BrandRow>();
  for (const r of latest.values()) {
    const restriction = r.inputs?.restriction;
    if (restriction?.status !== "approval_required") continue;
    const brand = r.product?.brand || r.offer?.brand || "Unknown brand";
    const key = brandKey(brand) || "unknown";
    const row = rows.get(key) ?? { key, brand, kinds: [], products: [], passFees: 0, applyUrl: null, applyTitle: null, approval: byKey.get(key) ?? null };
    const kind = approvalKind(restriction.message) ?? "unspecified";
    if (!row.kinds.includes(kind)) row.kinds.push(kind);
    const ok = passesFees(r);
    row.products.push({ asin: r.product?.asin ?? null, ean: r.product?.ean ?? "", title: r.product?.title ?? null, passesFees: ok });
    if (ok) row.passFees++;
    if (!row.applyUrl) {
      const link = applyLinks(r.gate_outcomes.find((o) => o.gate === "gating")?.links ?? restriction.links)[0];
      if (link) {
        row.applyUrl = link.resource;
        row.applyTitle = link.title;
      }
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.passFees - a.passFees || b.products.length - a.products.length || a.brand.localeCompare(b.brand));
}
