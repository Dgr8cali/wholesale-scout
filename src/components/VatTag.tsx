import { cn } from "@/lib/utils";

/**
 * The VAT basis a profit, ROI or margin is on: "VAT reg." (sale price less output VAT; fees and goods
 * ex-VAT) or "Non-VAT" (VAT on fees and goods is a cost). Settings → Business sets it.
 */
export function VatTag({ registered, className }: { registered: boolean | null | undefined; className?: string }) {
  if (registered == null) return null;
  return (
    <span
      title={registered ? "VAT registered: revenue is the sale price less output VAT; fees and goods count ex-VAT (the VAT is reclaimed)" : "Not VAT registered: revenue is the full sale price; VAT on fees and goods is a cost"}
      className={cn("inline-block rounded px-1 py-px align-middle text-[9.5px] leading-tight font-semibold tracking-wide whitespace-nowrap normal-case", registered ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2", className)}
    >
      {registered ? "VAT reg." : "Non-VAT"}
    </span>
  );
}

/** A saved result's basis: stored with its fees since the business setting; else whether output VAT came off. */
export function vatBasisOf(fees: { vatRegistered?: boolean | null; outputVat?: number | null } | null | undefined): boolean | null {
  if (!fees) return null;
  if (typeof fees.vatRegistered === "boolean") return fees.vatRegistered;
  return (fees.outputVat ?? 0) > 0;
}
