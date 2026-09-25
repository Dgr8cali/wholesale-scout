/** Brand keys and your approval records (the brand map itself is in ./brandMap). */

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
