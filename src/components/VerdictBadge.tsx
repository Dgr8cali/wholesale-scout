import { ProductDecision, StatusChip } from "@/components/ui/status-chip";

/** A row's verdict as the product decision (Buy / Check / Skip), or "Error" for a row that failed to process. */
export function VerdictBadge({ verdict, error = false }: { verdict: "pass" | "warn" | "fail" | null | undefined; error?: boolean }) {
  if (error) return <StatusChip tone="bad">Error</StatusChip>;
  if (!verdict) return null;
  return <ProductDecision verdict={verdict} />;
}
