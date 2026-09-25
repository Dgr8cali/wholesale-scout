"use client";

import { StarIcon, StarOffIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
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
  /** Each action shows only where the page offers it. */
  onStar?: () => Promise<void>;
  onUnstar?: () => Promise<void>;
  onWaive?: (gate: GateId, reason: string) => Promise<void>;
  onUnwaive?: (gate: GateId) => Promise<void>;
  onRescreen?: () => Promise<void>;
  onExport?: () => void;
  onRemove?: () => Promise<void>;
}) {
  const [gate, setGate] = useState<GateId>("budgetFit");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm } = useDialogs();

  const act = async (label: string, fn: () => Promise<void>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) toast.success(done);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!count) {
    return stashed ? (
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Selection of {stashed} cleared because the filters changed.</span>
        <Button variant="link" size="sm" className="h-auto p-0 text-brand" onClick={onReselect}>Reselect {stashed}</Button>
      </div>
    ) : null;
  }

  const sep = <Separator orientation="vertical" className="data-vertical:h-5 data-vertical:self-center" />;
  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${count} row${count === 1 ? "" : "s"} from this run?`,
      description: "Products and favourites are kept.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok && onRemove) await act("remove", onRemove, `Removed ${count}`);
  };
  return (
    <div className="panel sticky top-14 z-20 flex flex-wrap items-center gap-2 border-brand px-3 py-2 shadow-md" role="toolbar" aria-label="Actions on selected rows">
      <span className="text-sm font-semibold"><span className="num">{count}</span> selected</span>
      {sep}
      {onStar && <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("star", onStar, `Starred ${count}`)}><StarIcon /> Star</Button>}
      {onUnstar && <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("unstar", onUnstar, `Un-starred ${count}`)}><StarOffIcon /> Unstar</Button>}
      {(onStar || onUnstar) && sep}
      {onWaive && onUnwaive && <>
      <NativeSelect size="sm" className="w-44" value={gate} onChange={(e) => setGate(e.target.value as GateId)} aria-label="Gate to waive or un-waive">
        {GATE_ORDER.map((g) => <NativeSelectOption key={g} value={g}>{GATE_LABELS[g]}</NativeSelectOption>)}
      </NativeSelect>
      <Input className="h-7 w-44 text-xs" placeholder="Reason for all (optional)" value={reason} maxLength={300}
        onChange={(e) => setReason(e.target.value)} aria-label="Reason for waiving" />
      <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("waive", () => onWaive(gate, reason), `Waived ${GATE_LABELS[gate]} for ${count}`)}>
        {busy === "waive" ? "Waiving…" : "Waive"}
      </Button>
      <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("unwaive", () => onUnwaive(gate), `Un-waived ${GATE_LABELS[gate]} for ${count}`)}>
        {busy === "unwaive" ? "…" : "Un-waive"}
      </Button>
      {sep}
      </>}
      {onRescreen && <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("rescreen", onRescreen)}>{busy === "rescreen" ? "Starting…" : "Re-screen selected"}</Button>}
      {onExport && <Button variant="outline" size="xs" disabled={!!busy} onClick={onExport}>Export selected</Button>}
      {onRemove && (
        <Button variant="outline" size="xs" className="text-fail hover:text-fail" disabled={!!busy} onClick={remove}>
          Remove from run
        </Button>
      )}
      <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={onClear}><XIcon /> Clear selection</Button>
    </div>
  );
}
