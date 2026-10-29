import type { NextRequest } from "next/server";
import { createEmailLink, EMAIL_LINK_MINUTES, isAllowed } from "@/lib/server/auth";
import { limited } from "@/lib/server/authRoutes";
import { appUrl, sendEmail, signInEmailConfigured } from "@/lib/server/email";
import { handle } from "@/lib/server/http";
import { clientIp } from "@/lib/server/rateLimit";

/**
 * { email }: email a sign-in link (15 minutes, once) to an allowed address. The answer is the same
 * whether or not the address is allowed, so it can't be used to find out which is.
 */
export const POST = handle(async (req: NextRequest) => {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  if (!signInEmailConfigured()) return Response.json({ error: "Email sign-in isn't set up on this server yet: use your passkey." }, { status: 503 });
  const email = String(((await req.json().catch(() => ({}))) as { email?: unknown }).email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Enter your email address" }, { status: 400 });
  if (isAllowed(email)) {
    const link = `${appUrl()}/login?link=${await createEmailLink(email, clientIp(req.headers))}`;
    const r = await sendEmail({
      to: email, from: process.env.AUTH_EMAIL_FROM || undefined,
      subject: "Sign in to Wholesale Scout",
      text: `Sign in to Wholesale Scout:\n\n${link}\n\nThe link works once, for ${EMAIL_LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
      html: `<p><a href="${link}">Sign in to Wholesale Scout</a></p><p>The link works once, for ${EMAIL_LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.</p>`,
    });
    if (!r.sent) console.error(`sign-in email not sent: ${r.reason}`);
  }
  return Response.json({ ok: true, message: `If ${email} can sign in, a link is on its way. It works for ${EMAIL_LINK_MINUTES} minutes.` });
});
