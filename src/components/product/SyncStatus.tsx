"use client";

import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";

interface Status { stage: string; startedAt: string | null; finishedAt: string | null; error: string | null; missing: string[] }

/** When Amazon's figures were last read, and Sync now. */
export function SyncStatus({ onSynced }: { onSynced?: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Status>("/api/amazon/sync").then(setS).catch(() => {}); }, []);
  async function sync() {
    setBusy(true);
    const t = toast.loading("Asking Amazon for your orders, stock and fees…");
    try {
      const r = await api<Status>("/api/amazon/sync", { method: "POST" });
      setS(r);
      if (r.error) toast.error(r.error, { id: t });
      else if (r.stage === "idle") { toast.success("Synced with Amazon", { id: t }); onSynced?.(); }
      else toast.info("Amazon is still preparing the report; it finishes in the background within a few minutes.", { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  }
  if (!s) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            {s.stage !== "idle" ? "Syncing with Amazon…" : s.finishedAt ? `Amazon's figures read ${ago(s.finishedAt)}` : "Not synced with Amazon yet"}
            {s.error && <span className="text-fail"> · last sync failed</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-80">
          Nightly after 2am: your orders (units and prices), FBA stock, and Amazon&apos;s fee estimate at the price you sold at.
          {s.error ? ` Last error: ${s.error}.` : ""} Not available with this app&apos;s permissions: {s.missing.join("; ")}.
        </TooltipContent>
      </Tooltip>
      <Button variant="outline" size="sm" disabled={busy || s.stage !== "idle"} onClick={sync}>
        {busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Sync now
      </Button>
    </div>
  );
}
