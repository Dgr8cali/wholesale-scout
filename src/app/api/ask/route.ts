import type { NextRequest } from "next/server";
import { askHistory, askScout } from "@/lib/server/askScout";
import { handle } from "@/lib/server/http";

/** The last 20 questions and answers, newest first. */
export const GET = handle(async () => Response.json({ history: await askHistory() }));

/** Ask Scout a question about your own data (read-only lookups; the cost is logged). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { question?: string };
  if (!b.question?.trim()) return Response.json({ error: "Type a question" }, { status: 400 });
  return Response.json(await askScout(b.question));
});
