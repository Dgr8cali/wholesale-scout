"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextButton } from "@/components/ui/text-button";
/**
 * "Waive" on a failed or warning gate (asks for an optional reason inline), "Un-waive" on a waived one.
 * The parent does the saving; a rejected promise shows its message here.
 */
export function WaiveControl({ waived, failed = true, onWaive, onUnwaive }: {
  waived: boolean;
  /** The gate failed (its waiver makes it a warning) rather than warned (its waiver clears it). */
  failed?: boolean;
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
      <TextButton disabled={busy} onClick={(e) => { stop(e); run(onUnwaive); }}
        className="ml-2 flex-none text-xs font-medium">
        {busy ? "…" : "Un-waive"}
      </TextButton>
    );
  }
  if (!asking) {
    return (
      <TextButton onClick={(e) => { stop(e); setAsking(true); }}
        className="ml-2 flex-none text-xs font-medium"
        title={failed
          ? "Waive this gate for this product in every run: its fail becomes a warning and later gates run"
          : "Waive this warning for this product in every run: it stops counting against the row, which can go green"}>
        Waive
      </TextButton>
    );
  }
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1" onClick={stop}>
      <Input autoFocus className="h-7 text-xs w-48 text-xs" placeholder="Reason (optional)" value={reason} maxLength={300}
        disabled={busy} aria-label="Reason for waiving"
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { stop(e); if (e.key === "Enter") run(() => onWaive(reason)); if (e.key === "Escape") setAsking(false); }} />
      <Button type="button" disabled={busy} variant="secondary" size="xs" className="text-xs" onClick={() => run(() => onWaive(reason))}>{busy ? "Waiving…" : "Waive"}</Button>
      <TextButton tone="quiet" className="text-xs" onClick={() => setAsking(false)}>Cancel</TextButton>
      {error && <span className="w-full text-xs text-danger">{error}</span>}
    </span>
  );
}
