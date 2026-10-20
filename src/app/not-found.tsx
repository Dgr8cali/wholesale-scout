import { CompassIcon, HomeIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";

/** An address with nothing at it: one line, and the way back to Today. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl pt-6">
      <EmptyState icon={<CompassIcon />} title="Page not found" action={<Button asChild><Link href="/"><HomeIcon /> Back to Today</Link></Button>}>
        There&apos;s nothing at this address. It may have been a run that was deleted.
      </EmptyState>
    </div>
  );
}
