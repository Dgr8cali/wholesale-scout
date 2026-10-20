"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { CandidatePage } from "@/components/pl/candidate/CandidatePage";

/** Private label → Candidates → one candidate, in tabs (?tab=). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <Suspense><CandidatePage key={id} id={id} /></Suspense>;
}
