import "server-only";

/**
 * Alert email through Resend (https://resend.com): RESEND_API_KEY and ALERT_EMAIL_TO, with
 * ALERT_EMAIL_FROM optional (Resend's shared onboarding@resend.dev sender works until you verify
 * a domain, and only to your Resend account's own address). Without a key nothing is sent and
 * the alerts stay on the Watchlist page.
 */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.ALERT_EMAIL_TO;
}

/** The app's public address, for links in emails. */
export function appUrl(): string {
  const u = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://wholesale-scout.vercel.app");
  return u.replace(/\/$/, "");
}

export async function sendEmail(msg: { subject: string; html: string; text: string }): Promise<{ sent: boolean; reason?: string }> {
  if (!emailConfigured()) return { sent: false, reason: "RESEND_API_KEY and ALERT_EMAIL_TO aren't set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM || "Wholesale Scout <onboarding@resend.dev>",
        to: process.env.ALERT_EMAIL_TO!.split(",").map((s) => s.trim()).filter(Boolean),
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: false, reason: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
