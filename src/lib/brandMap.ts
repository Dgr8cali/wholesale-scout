/**
 * The brand-level map: every product's latest result on the default profile, rolled up per
 * brand, with a "wholesale-friendly" score. Pure, so the server and tests share it.
 */
import type { ApprovalStatus, BrandApproval } from "./brands";
import { matchIpRisk, type IpIndex, type IpRiskMatch } from "./ipRisk";

/** One product's row in the brand map (the brand_products table). */
export interface BrandProduct {
  product_id: string;
  brand_key: string;
  brand: string;
  ean: string;
  asin: string | null;
  title: string | null;
  image_url: string | null;
  result_id: string | null;
  verdict: "pass" | "warn" | "fail" | null;
  priced: boolean;
  sell_price: number | null;
  buy_box: number | null;
  fba_sellers: number | null;
  amazon: boolean | null;
  max_landed: number | null;
  restriction: string | null;
  apply_url: string | null;
  sellers: { id: string; name: string | null; sharePct: number }[];
  buy_box_holder: string | null;
  suppliers: string[];
}

/** Where you stand with the brand: approved or open, approval needed (applied or not), blocked. */
export type Gating = "open" | "approved" | "approval_needed" | "applied" | "blocked" | "unknown";

export const GATING_LABELS: Record<Gating, string> = {
  open: "Open",
  approved: "Approved",
  approval_needed: "Approval needed",
  applied: "Applied",
  blocked: "Blocked",
  unknown: "Unknown",
};

/** Badge colour per gating state. */
export const GATING_VARIANT: Record<Gating, "pass" | "warn" | "fail" | "muted" | "brand"> = {
  open: "pass", approved: "pass", approval_needed: "warn", applied: "brand", blocked: "fail", unknown: "muted",
};

export interface BrandSummary {
  key: string;
  brand: string;
  /** Distinct ASINs seen in any run. */
  asins: number;
  pass: number;
  warn: number;
  /** Average FBA sellers, over products with a count. */
  avgSellers: number | null;
  /** Share of listings Amazon sells or sold, %, over products where that's known. */
  amazonSharePct: number | null;
  avgBuyBox: number | null;
  medianMaxLanded: number | null;
  gating: Gating;
  /** Amazon's apply link, when approval is needed. */
  applyUrl: string | null;
  approval: BrandApproval | null;
  /** On your IP-risk list (Settings → IP risk). */
  ipRisk: IpRiskMatch | null;
  suppliers: { name: string; count: number }[];
  sellers: { id: string; name: string | null; count: number }[];
  score: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

/** The brand's gating: your approval record first, else what Amazon said on its listings. */
export function brandGating(rows: Pick<BrandProduct, "restriction">[], approval: { status: ApprovalStatus } | null): Gating {
  if (approval?.status === "approved") return "approved";
  if (approval?.status === "refused") return "blocked";
  const st = rows.map((r) => r.restriction).filter((s): s is string => !!s && s !== "unknown");
  if (!st.length) return approval?.status === "applied" ? "applied" : "unknown";
  if (st.includes("open")) return "open";
  if (st.includes("approval_required")) return approval?.status === "applied" ? "applied" : "approval_needed";
  return "blocked";
}

/**
 * Wholesale-friendly, 0–100: high where you can list it (open, or approval you can apply
 * for), Amazon rarely sells it, 2–8 FBA sellers share it, and several ASINs pass.
 * Gating 30, Amazon 25, sellers 20, passing ASINs 25. Unknowns score in the middle.
 * A high IP-risk brand scores half.
 */
export function wholesaleScore(b: Pick<BrandSummary, "gating" | "applyUrl" | "amazonSharePct" | "avgSellers" | "pass" | "warn"> & { ipRisk?: IpRiskMatch | null }): number {
  const gating = ({
    open: 1, approved: 1, applied: 0.8, approval_needed: b.applyUrl ? 0.7 : 0.4, blocked: 0, unknown: 0.5,
  } as const)[b.gating];
  const amazon = b.amazonSharePct == null ? 0.5 : Math.max(0, 1 - b.amazonSharePct / 100);
  const s = b.avgSellers;
  const sellers = s == null ? 0.5 : s >= 2 && s <= 8 ? 1 : s < 2 ? (s >= 1 ? 0.5 : 0.3) : s <= 12 ? 0.5 : 0.2;
  const n = b.pass + b.warn;
  const passing = n >= 5 ? 1 : n >= 3 ? 0.8 : n === 2 ? 0.6 : n === 1 ? 0.4 : 0;
  const score = gating * 30 + amazon * 25 + sellers * 20 + passing * 25;
  return Math.round(b.ipRisk?.level === "high" ? score / 2 : score);
}

/** Roll the brand map up per brand. */
export function aggregateBrands(rows: BrandProduct[], approvals: BrandApproval[], sellerNames: Map<string, string | null> = new Map(), ip?: IpIndex): BrandSummary[] {
  const byKey = new Map(approvals.map((a) => [a.brand_key, a]));
  const groups = new Map<string, BrandProduct[]>();
  for (const r of rows) groups.set(r.brand_key, [...(groups.get(r.brand_key) ?? []), r]);
  const out: BrandSummary[] = [];
  for (const [key, list] of groups) {
    const approval = byKey.get(key) ?? null;
    const priced = list.filter((r) => r.priced);
    const count = <K extends string>(names: K[]) => {
      const m = new Map<K, number>();
      for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
      return m;
    };
    const suppliers = count(list.flatMap((r) => r.suppliers));
    // Sellers: the top Buy Box sellers of its listings, and whoever holds each Buy Box now.
    const sellerIds = count(list.flatMap((r) => [...new Set([...r.sellers.map((s) => s.id), ...(r.buy_box_holder ? [r.buy_box_holder] : [])])]));
    const names = new Map<string, string | null>(list.flatMap((r) => r.sellers.map((s) => [s.id, s.name] as [string, string | null])));
    const amazonKnown = list.filter((r) => r.amazon != null);
    const gating = brandGating(list, approval);
    const row: BrandSummary = {
      key,
      // The most common spelling.
      brand: [...count(list.map((r) => r.brand))].sort((a, b) => b[1] - a[1])[0][0],
      asins: new Set(list.map((r) => r.asin).filter(Boolean)).size,
      pass: priced.filter((r) => r.verdict === "pass").length,
      warn: priced.filter((r) => r.verdict === "warn").length,
      avgSellers: r1(avg(list.map((r) => r.fba_sellers).filter((x): x is number => x != null))),
      amazonSharePct: amazonKnown.length ? Math.round((amazonKnown.filter((r) => r.amazon).length / amazonKnown.length) * 100) : null,
      avgBuyBox: r2(avg(list.map((r) => r.buy_box).filter((x): x is number => x != null))),
      medianMaxLanded: r2(median(list.map((r) => r.max_landed).filter((x): x is number => x != null))),
      gating,
      applyUrl: gating === "approval_needed" || gating === "applied" ? list.find((r) => r.apply_url)?.apply_url ?? null : null,
      approval,
      ipRisk: matchIpRisk(ip, ...new Set(list.map((r) => r.brand))),
      suppliers: [...suppliers].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count),
      sellers: [...sellerIds].map(([id, n]) => ({ id, name: names.get(id) ?? sellerNames.get(id) ?? null, count: n })).sort((a, b) => b.count - a.count),
      score: 0,
    };
    row.score = wholesaleScore(row);
    out.push(row);
  }
  return out.sort((a, b) => b.score - a.score || b.pass + b.warn - (a.pass + a.warn) || a.brand.localeCompare(b.brand));
}

/**
 * Home's "Brands to chase": the best-scoring brands not yet approved, with at least one product
 * that passes or warns (and not blocked or unbranded).
 */
export function brandsToChase(brands: BrandSummary[], n = 5): BrandSummary[] {
  return brands
    .filter((b) => b.pass + b.warn > 0 && b.key !== "unknown" && b.gating !== "approved" && b.gating !== "blocked" && b.approval?.status !== "approved")
    .slice(0, n);
}
