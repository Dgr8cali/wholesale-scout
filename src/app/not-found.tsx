import { CompassIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState icon={<CompassIcon />} title="Page not found" action={<Button asChild><Link href="/">Go home</Link></Button>}>
      There&apos;s nothing at this address. It may have been a run that was deleted.
    </EmptyState>
  );
}
