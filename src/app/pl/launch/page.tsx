import { redirect } from "next/navigation";
import { db, must } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * The old Launch checklist page: the launch is now a tab of each candidate (phase 4b). Goes to the
 * Launch tab of the candidate most recently worked on that's launching (at samples or launched, or
 * with a checklist step done), else to the pipeline.
 */
export default async function LaunchMoved() {
  const d = db();
  const [cands, steps] = await Promise.all([
    d.from("pl_candidates").select("id, status, updated_at").order("updated_at", { ascending: false }),
    d.from("pl_launch_steps").select("candidate_id").eq("done", true),
  ]);
  const withSteps = new Set((must(steps, "launch steps") as { candidate_id: string }[]).map((s) => s.candidate_id));
  const c = (must(cands, "candidates") as { id: string; status: string }[])
    .find((x) => x.status !== "parked" && x.status !== "dropped" && (x.status === "samples" || x.status === "launched" || withSteps.has(x.id)));
  redirect(c ? `/pl/candidates/${c.id}?tab=launch` : "/pl");
}
