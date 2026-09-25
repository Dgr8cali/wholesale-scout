"use client";

import { EmptyState, ErrorState } from "@/components/States";
import { ImageIcon, ListChecksIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EditableName } from "@/components/EditableName";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, when } from "@/lib/ui/client";

interface Run {
  id: string;
  name?: string | null;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  row_count: number;
  processed_count: number;
  token_cost: number;
  profile: { name: string } | null;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ runs: Run[] }>("/api/runs").then((r) => setRuns(r.runs)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Runs</h1>
          <p className="text-sm text-muted-foreground">Every price list you&apos;ve screened. Click a name to rename it.</p>
        </div>
        <ImageBackfill />
      </div>

      {error ? (
        <ErrorState title="Couldn't load runs" message={error} onRetry={() => { setError(null); api<{ runs: Run[] }>("/api/runs").then((r) => setRuns(r.runs)).catch((e) => setError(e.message)); }} />
      ) : !runs ? (
        <div className="panel space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !runs.length ? (
        <EmptyState icon={<ListChecksIcon />} title="No runs yet" action={<Button asChild><Link href="/upload"><UploadIcon /> Upload price list</Link></Button>}>
          Upload a supplier price list to screen it against Amazon UK.
        </EmptyState>
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Run</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="w-48">Status</TableHead>
                <TableHead className="pr-4 text-right">Keepa tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const done = r.status === "done";
                const pctDone = r.row_count ? Math.min(100, (r.processed_count / r.row_count) * 100) : 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[28rem] pl-4 whitespace-normal">
                      <EditableName value={r.name || r.source} inputClassName="py-1"
                        display={<Link href={`/runs/${r.id}`} className="font-medium hover:underline">{r.name || r.source}</Link>}
                        onSave={async (name) => {
                          await api(`/api/runs/${r.id}`, { method: "PATCH", json: { name } });
                          setRuns((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, name } : x)));
                        }} />
                      {r.name && r.name !== r.source && <div className="truncate text-xs text-muted-foreground">{r.source}</div>}
                    </TableCell>
                    <TableCell>{r.profile?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{when(r.started_at)}</TableCell>
                    <TableCell className="num text-right">{r.row_count.toLocaleString("en-GB")}</TableCell>
                    <TableCell>
                      {done ? <Badge variant="pass">Done</Badge> : r.status === "error" ? <Badge variant="fail">Error</Badge> : (
                        <div className="space-y-1">
                          <Badge variant="brand">Screening</Badge>
                          <div className="flex items-center gap-2">
                            <Progress value={pctDone} className="h-1.5 w-24" aria-label="Screened" />
                            <span className="num text-2xs text-muted-foreground">{r.processed_count} / {r.row_count}</span>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="num pr-4 text-right">{r.token_cost.toLocaleString("en-GB")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Products screened before images were kept get theirs from Amazon's catalog (free), 400 at a time. */
function ImageBackfill() {
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setState(null);
    try {
      let looked = 0, found = 0;
      for (;;) {
        const r = await api<{ looked: number; found: number }>("/api/products/images", { method: "POST" });
        looked += r.looked;
        found += r.found;
        setState(`Checked ${looked} products, found ${found} images…`);
        if (r.looked < 400) break;
      }
      setState(looked ? `Done: ${found} images found for ${looked} products.` : "Every product already has its image (or Amazon has none).");
    } catch (e) {
      setState((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {state && <span>{state}</span>}
      <Button variant="outline" size="sm" disabled={busy} onClick={run}><ImageIcon /> {busy ? "Fetching images…" : "Fetch missing images"}</Button>
    </div>
  );
}
