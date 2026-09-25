"use client";

import {
  ArchiveIcon, ArchiveRestoreIcon, ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, ChevronsUpIcon, PauseIcon, PlayIcon, DownloadCloudIcon, DownloadIcon, ExternalLinkIcon,
  FileSpreadsheetIcon, ImageIcon, ListChecksIcon, MoonIcon, MoreHorizontalIcon, PencilIcon, RefreshCwIcon, SearchIcon, StarIcon, Trash2Icon, UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { EditableName } from "@/components/EditableName";
import { allListings, downloadXlsx, exportRows } from "@/components/results/exportXlsx";
import type { Result } from "@/components/results/types";
import { EmptyState, ErrorState } from "@/components/States";
import { VerdictBar } from "@/components/VerdictBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { withDefaults, type ProfileConfig } from "@/lib/screening/config";
import { api, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Summary { pass: number; warn: number; fail: number; error: number; pending: number; suppliers: string[]; newestKeepa: string | null }
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
  archived_at?: string | null;
  paused_at?: string | null;
  profile: { name: string } | null;
  profile_snapshot?: Partial<ProfileConfig> | null;
  summary: Summary | null;
}

type SortKey = "started" | "name" | "rows";

/** The run's newest Keepa data is over 7 days old. */
const isStale = (r: Run) => !!r.summary?.newestKeepa && Date.now() - Date.parse(r.summary.newestKeepa) > 7 * 86_400_000;

/** Where a run's rows came from, from its name and source. */
function sourceKind(r: Run): { icon: typeof FileSpreadsheetIcon; label: string } {
  const s = `${r.name ?? ""} ${r.source}`;
  if (/\(nightly\)/.test(s)) return { icon: MoonIcon, label: "Qogita, nightly re-pull" };
  if (/^Qogita ·/.test(r.source)) return { icon: DownloadCloudIcon, label: "Pulled from Qogita" };
  if (/^Favourites/.test(r.source) || /^Favourites/.test(r.name ?? "")) return { icon: StarIcon, label: "Re-screen of favourites" };
  if (/^Re-screen|selection/i.test(r.source)) return { icon: RefreshCwIcon, label: "Re-screen of selected rows" };
  return { icon: FileSpreadsheetIcon, label: "Uploaded file" };
}

export default function RunsPage() {
  const router = useRouter();
  const { confirm, prompt } = useDialogs();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "started", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [keepaQueue, setKeepaQueue] = useState<string[]>([]);

  const load = useCallback(() => {
    api<{ runs: Run[]; keepaQueue?: string[] }>(`/api/runs${archived ? "?archived=1" : ""}`)
      .then((r) => { setRuns(r.runs); setKeepaQueue(r.keepaQueue ?? []); setError(null); })
      .catch((e) => setError(e.message));
  }, [archived]);
  useEffect(() => { load(); }, [load]);
  // Keep screening runs' progress live.
  useEffect(() => {
    if (!runs?.some((r) => r.status !== "done")) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [runs, load]);

  // Repeat uploads of the same file: one entry (the newest) with the older ones folded under it.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (runs ?? []).filter((r) => !needle || `${r.name ?? ""} ${r.source} ${(r.summary?.suppliers ?? []).join(" ")}`.toLowerCase().includes(needle));
    const bySource = new Map<string, Run[]>();
    for (const r of list) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
    const gs = [...bySource.values()].map((rs) => {
      const sorted = [...rs].sort((a, b) => b.started_at.localeCompare(a.started_at));
      return { key: sorted[0].id, lead: sorted[0], older: sorted.slice(1) };
    });
    const val = (r: Run) => (sort.key === "name" ? (r.name || r.source).toLowerCase() : sort.key === "rows" ? r.row_count : r.started_at);
    return gs.sort((a, b) => {
      const x = val(a.lead), y = val(b.lead);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [runs, q, sort]);
  const visibleIds = groups.flatMap((g) => [g.lead.id, ...(openGroups.has(g.key) ? g.older.map((r) => r.id) : [])]);

  const setSortKey = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function archive(ids: string[], on: boolean) {
    try {
      await Promise.all(ids.map((id) => api(`/api/runs/${id}`, { method: "PATCH", json: { archived: on } })));
      toast.success(`${on ? "Archived" : "Restored"} ${ids.length} run${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(ids: string[], label: string) {
    const ok = await confirm({
      title: ids.length === 1 && label ? `Delete “${label}”?` : `Delete ${ids.length} run${ids.length === 1 ? "" : "s"}?`,
      description: "The runs and their results are removed. Products, favourites and waivers are kept. This can't be undone.",
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    try {
      await Promise.all(ids.map((id) => api(`/api/runs/${id}`, { method: "DELETE" })));
      toast.success(`Deleted ${ids.length} run${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function rename(r: Run) {
    const name = await prompt({ title: "Rename run", label: "Name", defaultValue: r.name || r.source, confirmLabel: "Rename" });
    if (!name) return;
    try {
      await api(`/api/runs/${r.id}`, { method: "PATCH", json: { name } });
      setRuns((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, name } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function rescreen(r: Run) {
    try {
      const res = await api<{ rescored: number; remaining: number; profile: { name: string } }>(`/api/runs/${r.id}/rescreen`, { method: "POST", json: {} });
      toast.success(`Re-screening with ${res.profile.name}: ${res.rescored.toLocaleString("en-GB")} rows done${res.remaining ? `, ${res.remaining.toLocaleString("en-GB")} carrying on` : ""}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function control(r: Run, action: "pause" | "resume" | "keepaFirst" | "refresh") {
    try {
      const res = await api<{ requeued?: number }>(`/api/runs/${r.id}/control`, { method: "POST", json: { action } });
      toast.success(
        action === "pause" ? "Pausing after the current batch" : action === "resume" ? "Resumed"
          : action === "keepaFirst" ? `“${r.name || r.source}” goes first on Keepa`
          : res.requeued ? `Refreshing Keepa data for ${res.requeued.toLocaleString("en-GB")} rows` : "Nothing older than 7 days to refresh",
      );
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function exportRun(r: Run) {
    const t = toast.loading("Preparing the spreadsheet…");
    try {
      const { results } = await api<{ results: Result[] }>(`/api/runs/${r.id}`);
      const cfg = withDefaults(r.profile_snapshot ?? null);
      downloadXlsx(exportRows(allListings(results), (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100), r.name || r.source);
      toast.success("Exported", { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    }
  }

  const menu = (r: Run) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name || r.source}`}><MoreHorizontalIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => router.push(`/runs/${r.id}`)}><ExternalLinkIcon /> Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => rename(r)}><PencilIcon /> Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => rescreen(r)} disabled={r.status !== "done"}><RefreshCwIcon /> Re-screen</DropdownMenuItem>
        {r.status !== "done" && (r.paused_at
          ? <DropdownMenuItem onSelect={() => control(r, "resume")}><PlayIcon /> Resume</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => control(r, "pause")}><PauseIcon /> Pause</DropdownMenuItem>)}
        {keepaQueue.includes(r.id) && keepaQueue[0] !== r.id && <DropdownMenuItem onSelect={() => control(r, "keepaFirst")}><ChevronsUpIcon /> Go first on Keepa</DropdownMenuItem>}
        {isStale(r) && <DropdownMenuItem onSelect={() => control(r, "refresh")}><RefreshCwIcon /> Refresh Keepa data</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => exportRun(r)}><DownloadIcon /> Export to xlsx</DropdownMenuItem>
        <DropdownMenuSeparator />
        {r.archived_at
          ? <DropdownMenuItem onSelect={() => archive([r.id], false)}><ArchiveRestoreIcon /> Restore</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => archive([r.id], true)}><ArchiveIcon /> Archive</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={() => remove([r.id], r.name || r.source)}><Trash2Icon /> Delete…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const row = (r: Run, opts: { older?: boolean; count?: number; groupKey?: string } = {}) => {
    const k = sourceKind(r);
    const s = r.summary;
    const done = r.status === "done";
    const pending = s?.pending ?? Math.max(0, r.row_count - r.processed_count);
    const pctDone = r.row_count ? Math.min(100, ((r.row_count - pending) / r.row_count) * 100) : 0;
    const groupOpen = opts.groupKey ? openGroups.has(opts.groupKey) : false;
    return (
      <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined} className={cn(opts.older && "bg-muted/30")}>
        <TableCell className="w-10 pl-4"><Checkbox aria-label={`Select ${r.name || r.source}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></TableCell>
        <TableCell className={cn("max-w-[26rem] whitespace-normal", opts.older && "pl-8")}>
          <div className="flex items-start gap-2">
            <span title={k.label} className="mt-0.5 flex-none text-muted-foreground"><k.icon className="size-4" aria-label={k.label} /></span>
            <div className="min-w-0">
              <EditableName value={r.name || r.source} inputClassName="py-1"
                display={<Link href={`/runs/${r.id}`} className="font-medium hover:underline">{r.name || r.source}</Link>}
                onSave={async (name) => {
                  await api(`/api/runs/${r.id}`, { method: "PATCH", json: { name } });
                  setRuns((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, name } : x)));
                }} />
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {r.name && r.name !== r.source && <span className="truncate">{r.source}</span>}
                {r.archived_at && <Badge variant="muted">archived</Badge>}
                {isStale(r) && <Badge variant="warn" title={`Newest Keepa data ${when(r.summary!.newestKeepa!)}; over 7 days old`}>stale</Badge>}
                {!!opts.count && (
                  <button className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline" aria-expanded={groupOpen}
                    onClick={() => setOpenGroups((g) => { const n = new Set(g); if (n.has(opts.groupKey!)) n.delete(opts.groupKey!); else n.add(opts.groupKey!); return n; })}>
                    <ChevronRightIcon className={cn("size-3 transition-transform", groupOpen && "rotate-90")} />
                    ×{opts.count + 1}: {opts.count} earlier upload{opts.count === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-sm">{s?.suppliers.length ? s.suppliers.join(", ") : <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{when(r.started_at)}</TableCell>
        <TableCell className="num text-right">{r.row_count.toLocaleString("en-GB")}</TableCell>
        <TableCell className="w-40">
          {s ? <VerdictBar counts={s} legend={false} /> : <Skeleton className="h-2" />}
          {s && <p className="num mt-1 text-2xs text-muted-foreground">{s.pass} pass · {s.warn} warn · {s.fail} fail</p>}
        </TableCell>
        <TableCell className="w-44">
          {done ? <Badge variant="pass">Done</Badge> : r.status === "error" ? <Badge variant="fail">Error</Badge> : r.paused_at ? (
            <div className="space-y-1">
              <Badge variant="muted">Paused</Badge>
              <p className="num text-2xs text-muted-foreground">at {(r.row_count - pending).toLocaleString("en-GB")} of {r.row_count.toLocaleString("en-GB")}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                <Badge variant="brand">Screening</Badge>
                {keepaQueue[0] === r.id && <Badge variant="pass" title="This run is the one spending Keepa tokens">Using Keepa</Badge>}
                {keepaQueue.includes(r.id) && keepaQueue[0] !== r.id && <Badge variant="muted" title="Another run is using Keepa; this one waits its turn">Waiting for Keepa</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Progress value={pctDone} className="h-1.5 w-20" aria-label="Screened" />
                <span className="num text-2xs text-muted-foreground">{Math.round(pctDone)}%</span>
              </div>
            </div>
          )}
        </TableCell>
        <TableCell className="w-12 pr-3 text-right">{menu(r)}</TableCell>
      </TableRow>
    );
  };

  const header = (key: SortKey, label: string) => (
    <button className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === key && "text-foreground")} onClick={() => setSortKey(key)}>
      {label}{sort.key === key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
    </button>
  );
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someChecked = visibleIds.some((id) => selected.has(id));
  const sel = [...selected];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Runs</h1>
          <p className="text-sm text-muted-foreground">Every price list you&apos;ve screened. Repeat uploads of the same file are grouped.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><ImageBackfillItem /></DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search runs, files or suppliers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search runs" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={archived} onCheckedChange={setArchived} /> Show archived
        </label>
        {sel.length > 0 && (
          <div className="ml-auto flex items-center gap-2" role="toolbar" aria-label="Actions on selected runs">
            <span className="text-sm font-medium"><span className="num">{sel.length}</span> selected</span>
            <Button variant="outline" size="sm" onClick={() => archive(sel, true)}><ArchiveIcon /> Archive</Button>
            <Button variant="outline" size="sm" className="text-fail hover:text-fail" onClick={() => remove(sel, "")}><Trash2Icon /> Delete…</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {error ? (
        <ErrorState title="Couldn't load runs" message={error} onRetry={load} />
      ) : !runs ? (
        <div className="panel space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !runs.length ? (
        <EmptyState icon={<ListChecksIcon />} title={archived ? "No runs" : "No runs yet"} action={<Button asChild><Link href="/upload"><UploadIcon /> Upload price list</Link></Button>}>
          Upload a supplier price list, or pull from Qogita, to screen it against Amazon UK.
        </EmptyState>
      ) : !groups.length ? (
        <EmptyState icon={<SearchIcon />} title="No runs match">Nothing matches “{q}”.</EmptyState>
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <Checkbox aria-label={allChecked ? "Clear selection" : "Select all shown"} checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={() => setSelected(allChecked ? new Set() : new Set(visibleIds))} />
                </TableHead>
                <TableHead>{header("name", "Run")}</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>{header("started", "Started")}</TableHead>
                <TableHead className="text-right">{header("rows", "Rows")}</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-3"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  {row(g.lead, { count: g.older.length, groupKey: g.key })}
                  {openGroups.has(g.key) && g.older.map((r) => row(r, { older: true }))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Products screened before images were kept get theirs from Amazon's catalog (free), 400 at a time. */
function ImageBackfillItem() {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const t = toast.loading("Fetching missing product images…");
    try {
      let looked = 0, found = 0;
      for (;;) {
        const r = await api<{ looked: number; found: number }>("/api/products/images", { method: "POST" });
        looked += r.looked;
        found += r.found;
        toast.loading(`Checked ${looked} products, found ${found} images…`, { id: t });
        if (r.looked < 400) break;
      }
      toast.success(looked ? `${found} images found for ${looked} products` : "Every product already has its image (or Amazon has none)", { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  }
  return <DropdownMenuItem disabled={busy} onSelect={run}><ImageIcon /> Fetch missing images</DropdownMenuItem>;
}
