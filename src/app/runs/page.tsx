"use client";

import {
  ArchiveIcon, ArchiveRestoreIcon, ChevronRightIcon, ChevronsUpIcon, DownloadCloudIcon, DownloadIcon, ExternalLinkIcon, FileSpreadsheetIcon, ImageIcon, ListChecksIcon, MoonIcon, MoreHorizontalIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, RefreshCwIcon, ScanSearchIcon, SearchIcon, StarIcon, StoreIcon, Trash2Icon, UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { exportDgAsins, useDgImport } from "@/components/DgReport";
import { EditableName } from "@/components/EditableName";
import { allListings, downloadXlsx, exportRows } from "@/components/results/exportXlsx";
import type { Result } from "@/components/results/types";
import { EmptyState, ErrorState } from "@/components/States";
import { VerdictBar } from "@/components/VerdictBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { withDefaults, type ProfileConfig } from "@/lib/screening/config";
import { api, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { TextButton } from "@/components/ui/text-button";

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

/** The run's newest Keepa data is over 7 days old. */
const isStale = (r: Run) => !!r.summary?.newestKeepa && Date.now() - Date.parse(r.summary.newestKeepa) > 7 * 86_400_000;

/** Where a run's rows came from, from its name and source. */
function sourceKind(r: Run): { icon: typeof FileSpreadsheetIcon; label: string } {
  const s = `${r.name ?? ""} ${r.source}`;
  if (/\(nightly\)/.test(s)) return { icon: MoonIcon, label: "Qogita, nightly re-pull" };
  if (/^Qogita ·/.test(r.source)) return { icon: DownloadCloudIcon, label: "Pulled from Qogita" };
  if (/^Favourites/.test(r.source) || /^Favourites/.test(r.name ?? "")) return { icon: StarIcon, label: "Re-screen of favourites" };
  if (/^Re-screen|selection/i.test(r.source)) return { icon: RefreshCwIcon, label: "Re-screen of selected rows" };
  if (/^ASIN check/.test(r.source)) return { icon: ScanSearchIcon, label: "ASIN check" };
  if (/^Seller scan/.test(r.source)) return { icon: StoreIcon, label: "Seller scan" };
  return { icon: FileSpreadsheetIcon, label: "Uploaded file" };
}

export default function RunsPage() {
  const router = useRouter();
  const { confirm, prompt } = useDialogs();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
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
    return gs;
  }, [runs, q]);

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
  // Import DG report: from a run's menu, that run is re-screened once it's saved.
  const dgRun = useRef<Run | null>(null);
  const { pick: dgPick, input: dgInput } = useDgImport(async () => { if (dgRun.current) await rescreen(dgRun.current); });
  async function exportRun(r: Run) {
    const t = toast.loading("Preparing the spreadsheet…");
    try {
      const { run, results } = await api<{ run: { profile_snapshot?: Partial<ProfileConfig> | null }; results: Result[] }>(`/api/runs/${r.id}`);
      const cfg = withDefaults(run.profile_snapshot ?? null);
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => router.push(`/runs/${r.id}`)}><ExternalLinkIcon /> Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => rename(r)}><PencilIcon /> Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => rescreen(r)} disabled={r.status !== "done"}><RefreshCwIcon /> Re-screen</DropdownMenuItem>
        {r.status !== "done" && (r.paused_at
          ? <DropdownMenuItem onSelect={() => control(r, "resume")}><PlayIcon /> Resume</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => control(r, "pause")}><PauseIcon /> Pause</DropdownMenuItem>)}
        {keepaQueue.includes(r.id) && keepaQueue[0] !== r.id && <DropdownMenuItem onSelect={() => control(r, "keepaFirst")}><ChevronsUpIcon /> Go first on Keepa</DropdownMenuItem>}
        {isStale(r) && <DropdownMenuItem onSelect={() => control(r, "refresh")}><RefreshCwIcon /> Refresh Keepa data</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => exportRun(r)}><DownloadIcon /> Export to xlsx</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportDgAsins(r.id, r.name || r.source)}><DownloadIcon /> Export ASINs for DG lookup</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { dgRun.current = r; dgPick(); }} disabled={r.status !== "done"}><UploadIcon /> Import DG report…</DropdownMenuItem>
        <DropdownMenuSeparator />
        {r.archived_at
          ? <DropdownMenuItem onSelect={() => archive([r.id], false)}><ArchiveRestoreIcon /> Restore</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => archive([r.id], true)}><ArchiveIcon /> Archive</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={() => remove([r.id], r.name || r.source)}><Trash2Icon /> Delete…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // One table row per run: each group's newest run, with its older uploads under it when opened.
  // Every sort value carries the group's position, so a group's rows stay together in any order.
  type Line = { r: Run; lead: Run; gi: number; older: boolean; count: number; groupKey: string };
  const lines: Line[] = groups.flatMap((g, gi) => [
    { r: g.lead, lead: g.lead, gi, older: false, count: g.older.length, groupKey: g.key },
    ...(openGroups.has(g.key) ? g.older.map((r) => ({ r, lead: g.lead, gi, older: true, count: 0, groupKey: g.key })) : []),
  ]);
  const visibleIds = lines.map((l) => l.r.id);
  const byGroup = (v: string | null | undefined, l: Line) => (v == null ? null : `${v}\u0000${String(l.gi).padStart(6, "0")}`);
  const numByGroup = (v: number | null | undefined, l: Line) => (v == null ? null : v + l.gi / 1e7);
  const statusWord = (r: Run) => (r.status === "done" ? "Done" : r.status === "error" ? "Error" : r.paused_at ? "Paused" : "Screening");

  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someChecked = visibleIds.some((id) => selected.has(id));
  const sel = [...selected];

  const columns: DataColumn<Line>[] = [
    {
      id: "select", mobileHidden: true, className: "w-10",
      header: <Checkbox aria-label={allChecked ? "Clear selection" : "Select all shown"} checked={allChecked ? true : someChecked ? "indeterminate" : false}
        onCheckedChange={() => setSelected(allChecked ? new Set() : new Set(visibleIds))} />,
      cell: ({ r }) => <Checkbox aria-label={`Select ${r.name || r.source}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />,
    },
    {
      id: "name", header: "Run", mobile: "title", className: "max-w-[26rem] min-w-[14rem]",
      sortValue: (l) => byGroup(l.lead.name || l.lead.source, l),
      cell: ({ r, older, count, groupKey }) => {
        const k = sourceKind(r);
        const groupOpen = openGroups.has(groupKey);
        return (
          <div className={cn("flex items-start gap-2", older && "pl-6")}>
            {/* The checkbox, on a phone (the column is hidden there). */}
            <Checkbox className="mt-0.5 sm:hidden" aria-label={`Select ${r.name || r.source}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
            <span title={k.label} className="mt-0.5 flex-none text-muted-foreground"><k.icon className="size-4" aria-label={k.label} /></span>
            <div className="min-w-0">
              <EditableName value={r.name || r.source} inputClassName="py-1"
                display={<Link href={`/runs/${r.id}`} className="font-medium hover:underline">{r.name || r.source}</Link>}
                onSave={async (name) => {
                  await api(`/api/runs/${r.id}`, { method: "PATCH", json: { name } });
                  setRuns((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, name } : x)));
                }} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta font-normal text-muted-foreground">
                {r.name && r.name !== r.source && <span className="truncate">{r.source}</span>}
                {r.archived_at && <StatusChip tone="neutral" icon={false}>Archived</StatusChip>}
                {isStale(r) && <StatusChip tone="warn" title={`Newest Keepa data ${when(r.summary!.newestKeepa!)}; over 7 days old`}>Stale</StatusChip>}
                {!!count && (
                  <TextButton className="gap-0.5 font-medium" aria-expanded={groupOpen}
                    onClick={() => setOpenGroups((g) => { const n = new Set(g); if (n.has(groupKey)) n.delete(groupKey); else n.add(groupKey); return n; })}>
                    <ChevronRightIcon className={cn("size-3 transition-transform", groupOpen && "rotate-90")} />
                    ×{count + 1}: {count} earlier upload{count === 1 ? "" : "s"}
                  </TextButton>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    { id: "supplier", header: "Supplier", sortValue: (l) => byGroup(l.lead.summary?.suppliers[0], l), cell: ({ r }) => (r.summary?.suppliers.length ? r.summary.suppliers.join(", ") : <span className="text-muted-foreground">—</span>) },
    { id: "started", header: "Started", sortValue: (l) => byGroup(l.lead.started_at, l), cell: ({ r }) => <span className="whitespace-nowrap text-muted-foreground">{when(r.started_at)}</span> },
    { id: "rows", header: "Rows", numeric: true, sortValue: (l) => numByGroup(l.lead.row_count, l), cell: ({ r }) => r.row_count.toLocaleString("en-GB") },
    {
      id: "results", header: "Results", mobile: 1, className: "w-52 min-w-36", sortValue: (l) => numByGroup(l.lead.summary?.pass, l),
      // The same bar as Home: pass / warn / fail (and errors, rows still to screen), with counts.
      cell: ({ r }) => (r.summary ? <VerdictBar counts={r.summary} /> : <Skeleton className="h-2" />),
    },
    { id: "status", header: "Status", mobile: 2, className: "w-44", sortValue: (l) => byGroup(statusWord(l.lead), l), cell: ({ r }) => <RunStatus r={r} keepaQueue={keepaQueue} /> },
    { id: "act", header: <span className="sr-only">Actions</span>, mobile: 3, className: "w-12 text-right", cell: ({ r }) => menu(r) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Runs"
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Runs" }]}
        subtitle="Every price list you've screened. Repeat uploads of the same file are grouped."
        actions={<>
          <Button asChild><Link href="/new-run"><PlusIcon /> New run</Link></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="More actions"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { dgRun.current = null; dgPick(); }}><UploadIcon /> Import DG report…</DropdownMenuItem>
              <ImageBackfillItem />
            </DropdownMenuContent>
          </DropdownMenu>
          {dgInput}
        </>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search runs, files or suppliers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search runs" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={archived} onCheckedChange={setArchived} /> Show archived
        </label>
        {sel.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2" role="toolbar" aria-label="Actions on selected runs">
            <span className="text-sm font-medium"><span className="num">{sel.length}</span> selected</span>
            <Button variant="secondary" size="sm" onClick={() => archive(sel, true)}><ArchiveIcon /> Archive</Button>
            <Button variant="danger" size="sm" onClick={() => remove(sel, "")}><Trash2Icon /> Delete…</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {error ? (
        <ErrorState title="Couldn't load runs" message={error} onRetry={load} />
      ) : !runs ? (
        <div className="panel space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !runs.length ? (
        <EmptyState icon={<ListChecksIcon />} title={archived ? "No runs" : "No runs yet"} action={<Button asChild><Link href="/new-run"><PlusIcon /> New run</Link></Button>}>
          Upload a supplier price list, or pull from Qogita, to screen it against Amazon UK.
        </EmptyState>
      ) : (
        <DataTable
          rows={lines}
          columns={columns}
          getRowId={(l) => l.r.id}
          storageKey="wholesale.runs"
          caption="Runs"
          initialSort={{ id: "started", desc: true }}
          rowClassName={(l) => cn(selected.has(l.r.id) && "bg-primary-soft/60", l.older && "bg-subtle/50")}
          empty={{ icon: <SearchIcon />, title: "No runs match", description: `Nothing matches “${q}”.` }}
        />
      )}
    </div>
  );
}

/** Done, error, paused (and how far), or screening with its progress and its place in the Keepa queue. */
function RunStatus({ r, keepaQueue }: { r: Run; keepaQueue: string[] }) {
  const pending = r.summary?.pending ?? Math.max(0, r.row_count - r.processed_count);
  const pctDone = r.row_count ? Math.min(100, ((r.row_count - pending) / r.row_count) * 100) : 0;
  if (r.status === "done") return <StatusChip tone="good">Done</StatusChip>;
  if (r.status === "error") return <StatusChip tone="bad">Error</StatusChip>;
  if (r.paused_at) return (
    <div className="space-y-1">
      <StatusChip tone="neutral">Paused</StatusChip>
      <p className="num text-xs text-muted-foreground">at {(r.row_count - pending).toLocaleString("en-GB")} of {r.row_count.toLocaleString("en-GB")}</p>
    </div>
  );
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <StatusChip tone="info">Screening</StatusChip>
        {keepaQueue[0] === r.id && <StatusChip tone="good" title="This run is the one spending Keepa tokens">Using Keepa</StatusChip>}
        {keepaQueue.includes(r.id) && keepaQueue[0] !== r.id && <StatusChip tone="neutral" title="Another run is using Keepa; this one waits its turn">Waiting for Keepa</StatusChip>}
      </div>
      <div className="flex items-center gap-2">
        <Progress value={pctDone} className="h-1.5 w-20" aria-label="Screened" />
        <span className="num text-xs text-muted-foreground">{Math.round(pctDone)}%</span>
      </div>
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
