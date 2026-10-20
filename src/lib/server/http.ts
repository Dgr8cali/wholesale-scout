import "server-only";
import { forget } from "./memo";
import { redact } from "./secrets";

/** The memo key prefix of Today's facts (nextSteps.ts). */
export const TODAY_CACHE = "today:";

/**
 * Wrap a route handler: JSON errors instead of an HTML 500. A write that succeeds (any method but
 * GET) drops Today's cached facts, so the next steps never show something you've just done.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const res = await fn(...args);
      const req = args[0] as { method?: string } | undefined;
      if (req?.method && req.method !== "GET" && res.ok) forget(TODAY_CACHE);
      return res;
    } catch (e) {
      // Whatever failed, no secret goes into the log or back to the caller.
      const message = redact(e instanceof Error ? e.message : String(e));
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
