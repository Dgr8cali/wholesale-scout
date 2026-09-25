"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/ui/client";
import { ago, stamp } from "@/lib/ui/when";

/**
 * "Checked 2 h ago · Re-check": when the verdict was reached, and a fresh check of the same
 * ASIN (and cost), opened as its own check run.
 */
export function Checked({ at, recheck }: { at: string | null | undefined; recheck: { text: string; supplier?: string | null } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // "2 h ago" moves on while the page is open.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  if (!at && !recheck) return null;
  async function go() {
    if (!recheck) return;
    setBusy(true);
    try {
      const r = await api<{ runId: string }>("/api/check", { method: "POST", json: { text: recheck.text, supplier: recheck.supplier ?? null } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <p className="text-xs text-muted-foreground">
      {at && <span title={stamp(at)}>Checked {ago(at)}</span>}
      {at && recheck && " · "}
      {recheck && (
        <button type="button" className="font-medium text-brand hover:underline disabled:opacity-50" disabled={busy} onClick={(e) => { e.stopPropagation(); void go(); }}>
          {busy ? "Checking…" : "Re-check"}
        </button>
      )}
    </p>
  );
}
