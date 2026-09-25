import { applyLinks } from "../spapi/parse";
import type { RestrictionLink as Link } from "../spapi/types";

/** Seller Central's approval-request page for an ASIN — the same URL Amazon returns when it gives one. */
export function approvalRequestUrl(asin: string): string {
  return `https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=${encodeURIComponent(asin)}`;
}

interface Outcome {
  gate: string;
  status: string;
  tags?: string[];
  links?: Link[];
}

/**
 * For a row gate 11 found approval-needed or blocked: "Apply on Amazon" (a button) when
 * Amazon's listings-restrictions response gave a link; otherwise "Check on Amazon" (a plain
 * text link) to Seller Central's approval page for the ASIN, so every restricted row has
 * somewhere to click. Nothing for open rows.
 */
export function RestrictionLink({ outcomes, asin }: { outcomes: Outcome[]; asin: string | null | undefined }) {
  const g = outcomes.find((o) =>
    o.gate === "gating" && (o.status === "warn" || o.status === "fail") && o.tags?.some((t) => t === "APPROVAL" || t === "BLOCKED"));
  if (!g) return null;
  const link = applyLinks(g.links)[0];
  if (link) {
    return (
      <a href={link.resource} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
        title={link.title ?? "Request approval in Seller Central"}
        className="ml-2 inline-flex items-center rounded border border-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-soft">
        Apply on Amazon ↗
      </a>
    );
  }
  if (!asin) return null;
  return (
    <a href={approvalRequestUrl(asin)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
      title="Amazon returned no link; opens Seller Central's approval page for this ASIN"
      className="ml-2 text-[11px] text-accent underline underline-offset-2 hover:text-ink">
      Check on Amazon ↗
    </a>
  );
}
