import type { Metadata } from "next";
import { PipelineBoard } from "@/components/pl/PipelineBoard";
import { pageTitle } from "@/lib/workspaces";

export const metadata: Metadata = { title: pageTitle("/pl", null) };

/** Private label's home: the pipeline board. */
export default function PipelinePage() {
  return <PipelineBoard />;
}
