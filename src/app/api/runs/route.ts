import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => {
  const rows = must(
    await db().from("runs")
      .select("*, profile:profiles(name)")
      .order("started_at", { ascending: false })
      .limit(50),
    "runs",
  );
  return Response.json({ runs: rows });
});
