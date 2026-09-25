import "server-only";
import { waitUntil } from "@vercel/functions";

const auth = (): Record<string, string> =>
  process.env.APP_PASSWORD ? { authorization: `Basic ${btoa(`worker:${process.env.APP_PASSWORD}`)}` } : {};

/**
 * Start (or continue) background processing of a run by calling its process route, without
 * waiting for it to finish. Carries the app password so the proxy lets it through.
 */
export async function kickRun(origin: string, runId: string, path: "process" | "rescreen" = "process"): Promise<void> {
  try {
    // Only long enough for the request to be received; the called function carries on by itself.
    await fetch(`${origin}/api/runs/${runId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth() },
      body: path === "rescreen" ? JSON.stringify({ continuing: true }) : undefined,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Timed out waiting for the response, as intended; the watchdog restarts a chain that died.
  }
}

/**
 * Fire the next call of a chain after this response is sent (Vercel's waitUntil keeps the
 * function alive just long enough to send it), so processing never depends on a page being open.
 */
export function scheduleNext(origin: string, runId: string, path: "process" | "rescreen" = "process"): void {
  waitUntil(kickRun(origin, runId, path));
}

/** Call one of the app's own POST routes in the background (the brand map's refresh chain). */
export function scheduleCall(origin: string, path: string): void {
  waitUntil((async () => {
    try {
      await fetch(`${origin}${path}`, { method: "POST", headers: auth(), signal: AbortSignal.timeout(5_000) });
    } catch {
      // Timed out waiting, as intended; the called route carries on.
    }
  })());
}
