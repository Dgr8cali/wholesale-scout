"use client";

import { startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { CopyIcon, FingerprintIcon, LogOutIcon, PlugIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { api, when } from "@/lib/ui/client";

interface Sec {
  sessions: { id: string; device: string; method: "passkey" | "email" | "password"; passkey: string | null; ip: string | null; created_at: string; last_seen_at: string; expires_at: string; current: boolean }[];
  passkeys: { id: string; name: string; synced: boolean; created_at: string; last_used_at: string | null }[];
  tokens: { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; last_ip: string | null }[];
}

const METHOD = { passkey: "passkey", email: "email link", password: "app password" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Settings → Security: passkeys, the devices signed in, and the extension's API tokens. */
export function SecurityTab() {
  const [s, setS] = useState<Sec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [tokenName, setTokenName] = useState("Chrome on my Mac");
  const [newToken, setNewToken] = useState<string | null>(null);
  const { confirm } = useDialogs();
  const router = useRouter();
  const load = useCallback(() => api<Sec>("/api/auth/security").then(setS).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  const act = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); await load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const addPasskey = () => act("passkey", async () => {
    const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/passkeys/options", { method: "POST" });
    let response;
    try { response = await startRegistration({ optionsJSON }); } catch (e) {
      if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") throw new Error("This device already has a passkey here.");
      throw e;
    }
    const r = await api<{ passkey: { name: string } }>("/api/auth/passkeys", { method: "POST", json: { response, name: keyName } });
    setKeyName("");
    toast.success(`Passkey added: ${r.passkey.name}`);
  });
  const removePasskey = async (id: string, name: string) => {
    if (!(await confirm({ title: `Remove the passkey "${name}"?`, description: "That device can no longer sign in with it (it stays in its keychain until you delete it there).", confirmLabel: "Remove", destructive: true }))) return;
    await act(`key:${id}`, async () => { await api(`/api/auth/passkeys/${id}`, { method: "DELETE" }); toast.success("Passkey removed"); });
  };
  const signOut = async (id: string, current: boolean) => {
    if (current) { await api("/api/auth/logout", { method: "POST" }); router.replace("/login"); return; }
    await act(`session:${id}`, async () => { await api(`/api/auth/sessions/${id}`, { method: "DELETE" }); toast.success("Signed out on that device"); });
  };
  const signOutEverywhere = async () => {
    if (!(await confirm({ title: "Sign out everywhere?", description: "Every browser signed in to Wholesale Scout is signed out, this one too. Extension tokens keep working (revoke them below).", confirmLabel: "Sign out everywhere", destructive: true }))) return;
    await api("/api/auth/sessions", { method: "DELETE" });
    router.replace("/login");
  };
  const createToken = () => act("token", async () => {
    const r = await api<{ token: string }>("/api/auth/tokens", { method: "POST", json: { name: tokenName } });
    setNewToken(r.token);
  });
  const revokeToken = async (id: string, name: string) => {
    if (!(await confirm({ title: `Revoke "${name}"?`, description: "The extension using it stops working at once; give it a new token to reconnect.", confirmLabel: "Revoke", destructive: true }))) return;
    await act(`token:${id}`, async () => { await api(`/api/auth/tokens/${id}`, { method: "DELETE" }); toast.success("Token revoked"); });
  };
  const copy = async () => { await navigator.clipboard.writeText(newToken ?? ""); toast.success("Token copied"); };

  if (error) return <ErrorState title="Couldn't load Security" message={error} />;
  if (!s) return <Skeleton className="h-60 rounded-lg" />;
  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4 sm:p-5">
        <SectionTitle title={<>Passkeys</>}>Sign in with Face ID, Touch ID or Windows Hello. Add one on each device you use: open this page on it and press Add. A passkey saved to iCloud Keychain also works on your other Apple devices.</SectionTitle>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {s.passkeys.length === 0 && <li className="p-3 text-sm text-muted-foreground">No passkey yet: add one on this device.</li>}
          {s.passkeys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{k.name} {k.synced && <StatusChip tone="info">synced</StatusChip>}</p>
                <p className="text-xs text-muted-foreground">Added {day(k.created_at)} · last used {k.last_used_at ? when(k.last_used_at) : "never"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removePasskey(k.id, k.name)} disabled={s.passkeys.length === 1} loading={busy === `key:${k.id}`} title={s.passkeys.length === 1 ? "Your only passkey: add another first" : undefined}>Remove</Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full max-w-xs space-y-1.5">
            <span className="field-label">Name (optional)</span>
            <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. MacBook, iPhone" maxLength={60} />
          </label>
          <Button onClick={addPasskey} loading={busy === "passkey"}><FingerprintIcon />Add a passkey on this device</Button>
        </div>
      </section>

      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle title={<>Signed-in devices</>}>Each browser stays signed in for 90 days after it was last used.</SectionTitle>
          <Button variant="danger" onClick={signOutEverywhere}><LogOutIcon />Sign out everywhere</Button>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {s.sessions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{x.device} {x.current && <StatusChip tone="good">this device</StatusChip>}</p>
                <p className="text-xs text-muted-foreground">
                  By {METHOD[x.method]}{x.passkey ? ` (${x.passkey})` : ""} · signed in {day(x.created_at)} · last active {when(x.last_seen_at)}{x.ip ? <> · <span className="num">{x.ip}</span></> : null}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => signOut(x.id, x.current)} loading={busy === `session:${x.id}`}>Sign out</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel space-y-4 p-4 sm:p-5">
        <SectionTitle title={<>Extension tokens</>}>The Chrome extension signs in with its own token: paste it into the extension&apos;s popup. A token only opens the extension&apos;s endpoints, and is shown once.</SectionTitle>
        {newToken && (
          <div className="space-y-2 rounded-lg border border-warn/40 bg-warn-soft p-3" role="status">
            <p className="text-sm font-medium">Copy it now: it won&apos;t be shown again.</p>
            <div className="flex gap-2">
              <Input readOnly value={newToken} className="num" aria-label="New token" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" onClick={copy}><CopyIcon />Copy</Button>
            </div>
            <Button variant="link" onClick={() => setNewToken(null)}>Done</Button>
          </div>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {s.tokens.length === 0 && <li className="p-3 text-sm text-muted-foreground">No tokens: create one for each browser with the extension.</li>}
          {s.tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name} <span className="num text-xs text-muted-foreground">{t.prefix}…</span></p>
                <p className="text-xs text-muted-foreground">Created {day(t.created_at)} · last used {t.last_used_at ? when(t.last_used_at) : "never"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => revokeToken(t.id, t.name)} loading={busy === `token:${t.id}`}>Revoke</Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full max-w-xs space-y-1.5">
            <span className="field-label">Token name</span>
            <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} maxLength={80} />
          </label>
          <Button variant="secondary" onClick={createToken} loading={busy === "token"}><PlugIcon />Create token</Button>
        </div>
      </section>
    </div>
  );
}
