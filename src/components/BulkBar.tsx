"use client";

import { useState } from "react";
import { GATE_LABELS, GATE_ORDER, type GateId } from "@/lib/screening/config";

/**
 * Actions on the selected result rows. Each action reports its own error; the parent does
 * the work and refreshes the table.
 */
export function BulkBar({ count, stashed, onReselect, onClear, onStar, onUnstar, onWaive, onUnwaive, onRescreen, onExport, onRemove }: {
  count: number;
  /** Size of a selection cleared by a filter change, for "Reselect". */
  stashed: number;
  onReselect: () => void;
  onClear: () => void;
  onStar: () => Promise<void>;
  onUnstar: () => Promise<void>;
  onWaive: (gate: GateId, reason: string) => Promise<void>;
  onUnwaive: (gate: GateId) => Promise<void>;
  onRescreen: () => Promise<void>;
  onExport: () => void;
  onRemove: () => Promise<void>;
}) {
  const [gate, setGate] = useState<GateId>("budgetFit");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const act = async (label: string, fn: () => Promise<void>, done?: string) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg({ ok: true, text: done });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!count) {
    return stashed ? (
      <div className="card flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="text-muted">Selection of {stashed} cleared because the filters changed.</span>
        <button className="font-medium text-accent hover:underline" onClick={onReselect}>Reselect {stashed}</button>
      </div>
    ) : null;
  }

  const b = "btn py-1 text-xs";
  return (
    <div className="card sticky top-2 z-20 flex flex-wrap items-center gap-2 border-accent px-3 py-2 shadow-md" role="toolbar" aria-label="Actions on selected rows">
      <span className="text-sm font-semibold"><span className="num">{count}</span> selected</span>
      <span className="h-5 w-px bg-line" />
      <button className={b} disabled={!!busy} onClick={() => act("star", onStar, `Starred ${count}`)}>★ Star</button>
      <button className={b} disabled={!!busy} onClick={() => act("unstar", onUnstar, `Un-starred ${count}`)}>☆ Unstar</button>
      <span className="h-5 w-px bg-line" />
      <select className="input w-auto py-1 text-xs" value={gate} onChange={(e) => setGate(e.target.value as GateId)} aria-label="Gate to waive or un-waive">
        {GATE_ORDER.map((g) => <option key={g} value={g}>{GATE_LABELS[g]}</option>)}
      </select>
      <input className="input w-44 py-1 text-xs" placeholder="Reason for all (optional)" value={reason} maxLength={300}
        onChange={(e) => setReason(e.target.value)} aria-label="Reason for waiving" />
      <button className={b} disabled={!!busy} onClick={() => act("waive", () => onWaive(gate, reason), `Waived ${GATE_LABELS[gate]} for ${count}`)}>
        {busy === "waive" ? "Waiving…" : "Waive"}
      </button>
      <button className={b} disabled={!!busy} onClick={() => act("unwaive", () => onUnwaive(gate), `Un-waived ${GATE_LABELS[gate]} for ${count}`)}>
        {busy === "unwaive" ? "…" : "Un-waive"}
      </button>
      <span className="h-5 w-px bg-line" />
      <button className={b} disabled={!!busy} onClick={() => act("rescreen", onRescreen)}>{busy === "rescreen" ? "Starting…" : "Re-screen selected"}</button>
      <button className={b} disabled={!!busy} onClick={onExport}>Export selected</button>
      <button className={`${b} text-fail`} disabled={!!busy}
        onClick={() => confirm(`Remove ${count} row${count === 1 ? "" : "s"} from this run? Products and favourites are kept.`) && act("remove", onRemove, `Removed ${count}`)}>
        Remove from run
      </button>
      <button className="ml-auto text-xs text-muted hover:text-ink hover:underline" onClick={onClear}>Clear selection</button>
      {msg && <span className={`w-full text-xs ${msg.ok ? "text-pass" : "text-fail"}`}>{msg.text}</span>}
    </div>
  );
}
