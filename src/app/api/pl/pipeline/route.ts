import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { pipelineBoard, pipelineCard } from "@/lib/server/plPipeline";

/** The pipeline board: every candidate's column, gate bar and next action, and the products already selling. ?id=: one candidate's card. */
export const GET = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json(await pipelineBoard());
  const card = await pipelineCard(id);
  return card ? Response.json({ card }) : Response.json({ error: "No such candidate" }, { status: 404 });
});
