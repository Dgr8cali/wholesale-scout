import * as XLSX from "xlsx";
import { GATE_LABELS } from "@/lib/screening/config";
import { groupRows } from "@/lib/ui/group";
import { firstOrderFigures } from "@/lib/ui/metrics";
import { eanOf, figure, titleOf, type Result } from "./types";

/** One spreadsheet row per listing, as the run page exports it. */
export function exportRows(flat: { r: Result; listing: string }[], lineBudget: number) {
  return flat.map(({ r, listing }) => {
    const plan = r.score == null ? null : firstOrderFigures(r.inputs?.market, r.landed_cost, r.offer?.moq, lineBudget);
    return {
      Listing: listing,
      Verdict: r.status === "error" ? "error" : r.verdict,
      Score: r.score,
      Band: r.band,
      Product: titleOf(r),
      Brand: r.product?.brand,
      EAN: r.product?.ean,
      ASIN: r.product?.asin,
      Supplier: r.offer?.supplier?.name,
      "Cost / unit (quoted)": r.offer?.unit_cost,
      Currency: r.offer?.currency,
      "Cost / unit (GBP ex-VAT)": r.offer?.unit_cost_gbp,
      "Est. sales / month": figure(r, "sales").value,
      "Est. sales source": figure(r, "sales").note,
      Sellers: figure(r, "sellers").value,
      "Your share / mo": figure(r, "share").value,
      "Your profit / mo": figure(r, "profitMo").value,
      "Order qty": plan?.qty.value ?? null,
      "Months to sell": plan?.months.value ?? null,
      "Sellers source": figure(r, "sellers").note,
      "Buy Box": figure(r, "buybox").value,
      "Landed cost": r.landed_cost,
      "Sell price": r.sell_price,
      "Price source": r.price_source,
      "Amazon fees": r.fees?.total,
      "Fee source": r.fees?.source,
      Profit: r.profit,
      "ROI %": r.roi,
      "Margin %": r.margin,
      "Hurdle price": r.hurdle_price,
      "Failed gate": r.failed_gate ? GATE_LABELS[r.failed_gate] : null,
      Why: r.status === "error" ? r.error : r.why,
      MOQ: r.offer?.moq,
      "Offers seen": r.offer_count,
      Source: r.offer?.source_ref,
    };
  });
}

/** Every screened listing of a run, best listing of each EAN first, as "best / only / alternative". */
export function allListings(results: Result[]) {
  const done = results.filter((r) => r.status !== "pending");
  const order = (a: Result, b: Result) => (b.score ?? -1) - (a.score ?? -1);
  return groupRows(done, eanOf, order).flatMap((g) => [{ r: g.lead, listing: g.others.length ? "best" : "only" }, ...g.others.map((r) => ({ r, listing: "alternative" }))]);
}

export function downloadXlsx(data: object[], name: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Shortlist");
  XLSX.writeFile(wb, `wholesale-scout-${name.replace(/[^\w-]+/g, "_").slice(0, 40)}.xlsx`);
}
