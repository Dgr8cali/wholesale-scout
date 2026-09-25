"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";

/** Any page that throws while rendering lands here instead of a blank screen. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState title="This page hit an error" message={error.message || "Unexpected error."} onRetry={reset}
      action={<Button variant="ghost" asChild><Link href="/">Go home</Link></Button>} />
  );
}
