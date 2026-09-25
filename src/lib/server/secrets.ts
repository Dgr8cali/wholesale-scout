import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Environment variables whose values must never appear in a log line or a response. */
const SECRET_NAME = /KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/;

/** Every secret value set now (6+ characters, longest first so overlaps are fully covered). */
function secretValues(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(env)
    .filter(([k, v]) => SECRET_NAME.test(k) && typeof v === "string" && v.length >= 6)
    .map(([, v]) => v!)
    .sort((a, b) => b.length - a.length);
}

/** Text with any secret's value replaced by [redacted]. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const v of secretValues(env)) if (out.includes(v)) out = out.split(v).join("[redacted]");
  return out;
}

/** The request carries `Authorization: Bearer <one of these secrets>` (compared in constant time). */
export function bearerIs(header: string | null, ...secrets: (string | undefined)[]): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  return secrets.some((s) => {
    if (!s) return false;
    const want = Buffer.from(s);
    return want.length === given.length && timingSafeEqual(want, given);
  });
}
