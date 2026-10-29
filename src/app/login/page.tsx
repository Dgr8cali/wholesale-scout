"use client";

import { browserSupportsWebAuthn, startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { FingerprintIcon, KeyRoundIcon, MailIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/ui/client";

interface State { signedIn: boolean; ready: boolean; passkeys: boolean; email: boolean; password: boolean }

const noSubscribe = () => () => {};

/** Only a path on this site (never //other.site or back to /login). */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/");

/** A cancelled or timed-out passkey prompt is not an error worth more than a line. */
function passkeyMessage(e: unknown) {
  if (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") return "Cancelled.";
  if (e instanceof Error && e.name === "NotAllowedError") return "The passkey prompt was closed or timed out. Try again.";
  return e instanceof Error ? e.message : String(e);
}

function SignIn() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const link = params.get("link");
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Passkeys need WebAuthn; read in the browser (the server render assumes yes).
  const webauthn = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => true);

  useEffect(() => {
    api<State>("/api/auth/state").then((s) => {
      if (s.signedIn) window.location.replace(next);
      else setState(s);
    }).catch((e: Error) => setError(e.message));
  }, [next]);

  const done = () => window.location.assign(next);
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(what === "passkey" ? passkeyMessage(e) : (e as Error).message); setBusy(null); }
  };

  const passkey = () => run("passkey", async () => {
    const optionsJSON = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/auth/login/options", { method: "POST" });
    const response = await startAuthentication({ optionsJSON });
    await api("/api/auth/login/verify", { method: "POST", json: response });
    done();
  });
  const sendLink = (e: FormEvent) => { e.preventDefault(); void run("email", async () => {
    const r = await api<{ message: string }>("/api/auth/email", { method: "POST", json: { email } });
    setNotice(r.message); setBusy(null);
  }); };
  const useLink = () => run("link", async () => { await api("/api/auth/email/verify", { method: "POST", json: { token: link } }); done(); });
  const withPassword = (e: FormEvent) => { e.preventDefault(); void run("password", async () => { await api("/api/auth/password", { method: "POST", json: { password } }); done(); }); };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={44} />
        <div>
          <h1 className="text-xl font-semibold">Sign in to Wholesale Scout</h1>
          <p className="mt-1 text-sm text-muted-foreground">With the passkey on this device: Face ID, Touch ID or Windows Hello.</p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
        {link ? (
          <div className="space-y-3">
            <p className="text-sm">You opened a sign-in link. Continue to sign in on this device.</p>
            <Button className="w-full" size="lg" onClick={useLink} disabled={!!busy}><MailIcon />{busy === "link" ? "Signing in…" : "Continue signing in"}</Button>
          </div>
        ) : (
          <>
            <Button className="w-full" size="lg" onClick={passkey} disabled={!!busy || !webauthn || state?.ready === false}>
              <FingerprintIcon />{busy === "passkey" ? "Waiting for your passkey…" : "Sign in with passkey"}
            </Button>
            {!webauthn && <p className="text-xs text-muted-foreground">This browser can&apos;t use passkeys: email yourself a link instead.</p>}
            {state && !state.passkeys && <p className="text-xs text-muted-foreground">No passkey has been added yet. Sign in another way, then add one in Settings → Security.</p>}

            <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>

            {!emailOpen ? (
              <Button variant="secondary" className="w-full" onClick={() => setEmailOpen(true)} disabled={!!busy}><MailIcon />Email me a sign-in link</Button>
            ) : state && !state.email ? (
              <p className="text-sm text-muted-foreground">Email sign-in isn&apos;t set up on this server yet: use your passkey.</p>
            ) : (
              <form onSubmit={sendLink} className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                <Button type="submit" variant="secondary" className="w-full" disabled={!!busy}>{busy === "email" ? "Sending…" : "Send the link"}</Button>
              </form>
            )}

            {state?.password && (
              <form onSubmit={withPassword} className="space-y-2 border-t border-border pt-4">
                <Label htmlFor="password">App password</Label>
                <p className="text-xs text-muted-foreground">{state.passkeys ? "Emergency fallback (AUTH_PASSWORD_FALLBACK is on)." : "Until your first passkey is added."}</p>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="submit" variant="secondary" className="w-full" disabled={!!busy}><KeyRoundIcon />{busy === "password" ? "Signing in…" : "Sign in with the app password"}</Button>
              </form>
            )}
          </>
        )}
        {state?.ready === false && <p className="text-sm text-danger" role="alert">Sign-in isn&apos;t set up: AUTH_ALLOWED_EMAILS is empty on the server.</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {notice && <p className="text-sm text-success" role="status">{notice}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><SignIn /></Suspense>;
}
