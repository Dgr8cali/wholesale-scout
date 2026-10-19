import { Verdict } from "@/components/ui/status-chip";

/** A row's verdict (or "error" for a row that failed to process): the shared Verdict chip. */
export function VerdictBadge({ verdict, error = false }: { verdict: "pass" | "warn" | "fail" | null | undefined; error?: boolean }) {
  if (error) return <Verdict verdict="error" tone="bad" />;
  if (!verdict) return null;
  return <Verdict verdict={verdict} />;
}
