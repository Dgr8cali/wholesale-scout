import { advanceSync, syncStatus } from "@/lib/server/amazonSync";
import { handle } from "@/lib/server/http";

export const maxDuration = 60;

/** Where the nightly Amazon sync stands. */
export const GET = handle(async () => Response.json(await syncStatus()));

/** "Sync now": start one and take it as far as it gets in about 50 s (the watchdog finishes it otherwise). */
export const POST = handle(async () => {
  const until = Date.now() + 50_000;
  let s = await advanceSync({ force: true });
  while (s.stage !== "idle" && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 5_000));
    s = await advanceSync();
  }
  return Response.json(s);
});
