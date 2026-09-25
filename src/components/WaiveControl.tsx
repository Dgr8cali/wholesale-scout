"use client";

import { useState } from "react";

/**
 * "Waive" on a failed gate (asks for an optional reason inline), "Un-waive" on a waived one.
 * The parent does the saving; a rejected promise shows its message here.
 */
export function WaiveControl({ waived, onWaive, onUnwaive }: {
  waived: boolean;
  onWaive: (reason: string) => Promise<void>;
  onUnwaive: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAsking(false);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  if (waived) {
    return (
      <button type="button" disabled={busy} onClick={(e) => { stop(e); run(onUnwaive); }}
        className="ml-2 flex-none text-[11px] font-medium text-accent hover:underline disabled:opacity-50">
        {busy ? "…" : "Un-waive"}
      </button>
    );
  }
  if (!asking) {
    return (
      <button type="button" onClick={(e) => { stop(e); setAsking(true); }}
        className="ml-2 flex-none text-[11px] font-medium text-accent hover:underline"
        title="Waive this gate for this product in every run: its fail becomes a warning and later gates run">
        Waive
      </button>
    );
  }
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1" onClick={stop}>
      <input autoFocus className="input w-48 py-0.5 text-[11px]" placeholder="Reason (optional)" value={reason} maxLength={300}
        disabled={busy} aria-label="Reason for waiving"
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { stop(e); if (e.key === "Enter") run(() => onWaive(reason)); if (e.key === "Escape") setAsking(false); }} />
      <button type="button" disabled={busy} className="btn py-0.5 text-[11px]" onClick={() => run(() => onWaive(reason))}>{busy ? "Waiving…" : "Waive"}</button>
      <button type="button" className="text-[11px] text-muted hover:text-ink" onClick={() => setAsking(false)}>Cancel</button>
      {error && <span className="w-full text-[11px] text-fail">{error}</span>}
    </span>
  );
}
