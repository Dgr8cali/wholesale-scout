import { Badge } from "@/components/ui/badge";

/** A row's verdict (or "error" for a row that failed to process) as a small coloured badge. */
export function VerdictBadge({ verdict, error = false }: { verdict: "pass" | "warn" | "fail" | null | undefined; error?: boolean }) {
  if (error) return <Badge variant="fail">error</Badge>;
  if (!verdict) return null;
  return <Badge variant={verdict}>{verdict}</Badge>;
}
