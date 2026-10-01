"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * "Waive" on a failed or warned check, "Waive gate" on a gate: a one-line reason (required), then
 * save. The parent saves; a rejected promise shows its message here.
 */
export function WaivePopover({ trigger, title, onWaive }: { trigger: ReactNode; title: string; onWaive: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!reason.trim()) { setError("Give a reason: the verdict shows it."); return; }
    setBusy(true);
    setError(null);
    try {
      await onWaive(reason.trim());
      setOpen(false);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">A waived check counts as a pass for the gate. The verdict still lists it.</p>
        <Input autoFocus value={reason} maxLength={300} placeholder="Reason (one line, required)" aria-label="Reason for the waiver" disabled={busy}
          onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        {error && <p className="text-xs text-fail">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Waive"}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
