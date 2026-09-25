import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => {
  const rows = must(
    await db().from("runs")
      .select("id, source, status, started_at, finished_at, row_count, processed_count, token_cost, profile:profiles(name)")
      .order("started_at", { ascending: false })
      .limit(50),
    "runs",
  );
  return Response.json({ runs: rows });
});
