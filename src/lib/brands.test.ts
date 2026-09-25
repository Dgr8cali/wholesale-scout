import { describe, expect, it } from "vitest";
import { brandKey, groupApprovals, passesFees, type ApprovalResult } from "./brands";

const floors = { minProfit: 2, minRoiPct: 20, minMarginPct: 15 };
const link = { resource: "https://sellercentral.amazon.co.uk/hz/approvalrequest?asin=B1", verb: "GET", title: "Request Approval via Seller Central.", type: "text/html" };

const res = (over: Partial<ApprovalResult> & { id: string; brand: string; fee?: string; at?: string; status?: string; message?: string }): ApprovalResult => ({
  product_id: over.id,
  updated_at: over.at ?? "2026-09-26T10:00:00Z",
  profit: over.profit ?? null,
  roi: over.roi ?? null,
  margin: over.margin ?? null,
  gate_outcomes: [
    { gate: "gating", status: "warn", links: [link] },
    ...(over.fee ? [{ gate: "fees", status: over.fee }] : []),
  ],
  inputs: { restriction: { status: over.status ?? "approval_required", message: over.message ?? "You need approval to list this brand.", links: [link] } },
  product: { asin: `B${over.id}`, ean: `50${over.id}`, title: `Product ${over.id}`, brand: over.brand },
  offer: { brand: over.brand },
  floors,
});

describe("brand approvals", () => {
  it("normalises brand keys", () => {
    expect(brandKey("La Roche-Posay")).toBe(brandKey("LA ROCHE POSAY"));
    expect(brandKey("Nuxe")).toBe("nuxe");
    expect(brandKey("Sébium")).toBe("sebium");
  });

  it("groups approval-needed results by brand, counting products that clear the fee engine", () => {
    const rows = groupApprovals([
      res({ id: "1", brand: "Nuxe", fee: "pass" }),
      res({ id: "2", brand: "NUXE", fee: "fail" }),
      res({ id: "3", brand: "Bioderma", fee: "pass" }),
      res({ id: "4", brand: "Bioderma", profit: 3, roi: 40, margin: 20 }), // stopped at gating: judged on its numbers
      res({ id: "5", brand: "Vichy", status: "blocked", fee: "pass" }), // blocked isn't approval-needed
      res({ id: "6", brand: "Vichy", status: "open", fee: "pass" }),
    ], [{ brand_key: "nuxe", brand: "Nuxe", status: "applied", requirement: "3 invoices", status_date: "2026-09-26" }]);
    expect(rows.map((r) => [r.brand, r.products.length, r.passFees])).toEqual([["Bioderma", 2, 2], ["Nuxe", 2, 1]]);
    expect(rows[1].approval?.status).toBe("applied");
    expect(rows[0].applyUrl).toBe(link.resource);
    expect(rows[0].kinds).toEqual(["brand"]);
  });

  it("uses each product's latest result across runs", () => {
    const rows = groupApprovals([
      res({ id: "1", brand: "Nuxe", fee: "fail", at: "2026-09-25T10:00:00Z" }),
      res({ id: "1", brand: "Nuxe", fee: "pass", at: "2026-09-26T10:00:00Z" }),
    ], []);
    expect(rows[0].products).toHaveLength(1);
    expect(rows[0].passFees).toBe(1);
  });

  it("judges the fee engine by the fee gate when it ran, else by the floors", () => {
    expect(passesFees(res({ id: "1", brand: "X", fee: "fail", profit: 9, roi: 90, margin: 50 }))).toBe(false);
    expect(passesFees(res({ id: "1", brand: "X", profit: 1, roi: 90, margin: 50 }))).toBe(false);
  });
});
