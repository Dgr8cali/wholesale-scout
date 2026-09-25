import "server-only";

/** Wrap a route handler: JSON errors instead of an HTML 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
