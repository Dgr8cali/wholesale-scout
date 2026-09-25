import "server-only";

/**
 * Start (or continue) background processing of a run by calling its process route, without
 * waiting for it to finish. Carries the app password so the proxy lets it through.
 */
export async function kickRun(origin: string, runId: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (process.env.APP_PASSWORD) headers.authorization = `Basic ${btoa(`worker:${process.env.APP_PASSWORD}`)}`;
  try {
    // Only long enough for the request to be received; the called function carries on.
    await fetch(`${origin}/api/runs/${runId}/process`, { method: "POST", headers, signal: AbortSignal.timeout(2_500) });
  } catch {
    // Timed out waiting for the response, as intended; or it'll be resumed from the run page.
  }
}
