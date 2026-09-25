"use client";

import { BuildingIcon, CheckIcon, ChevronRightIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { APPROVAL_STATUSES, STATUS_LABELS, type ApprovalStatus, type BrandRow } from "@/lib/brands";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
const STATUS_STYLE: Record<ApprovalStatus, string> = {
  not_applied: "text-muted-foreground",
  applied: "text-warn",
  approved: "text-pass",
  refused: "text-fail",
};

interface Draft {
  status: ApprovalStatus;
  requirement: string;
  status_date: string;
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | string>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "awaiting" | "approved" | "refused">("all");

  useEffect(() => {
    api<{ brands: BrandRow[] }>("/api/brands")
      .then((r) => {
        setBrands(r.brands);
        setDrafts(Object.fromEntries(r.brands.map((b) => [b.key, {
          status: b.approval?.status ?? "not_applied",
          requirement: b.approval?.requirement ?? "",
          status_date: b.approval?.status_date ?? "",
        }])));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(b: BrandRow, patch: Partial<Draft>) {
    const next = { ...drafts[b.key], ...patch };
    setDrafts((d) => ({ ...d, [b.key]: next }));
    setSaved((s) => ({ ...s, [b.key]: "saving" }));
    try {
      await api("/api/brands", { method: "PUT", json: { brand: b.brand, ...next } });
      setSaved((s) => ({ ...s, [b.key]: "saved" }));
    } catch (e) {
      setSaved((s) => ({ ...s, [b.key]: (e as Error).message }));
    }
  }

  const shown = useMemo(() => (brands ?? []).filter((b) => {
    const st = drafts[b.key]?.status ?? "not_applied";
    if (show === "awaiting" && !(st === "not_applied" || st === "applied")) return false;
    if (show === "approved" && st !== "approved") return false;
    if (show === "refused" && st !== "refused") return false;
    return !q.trim() || b.brand.toLowerCase().includes(q.trim().toLowerCase());
  }), [brands, drafts, show, q]);

  const header = (
    <div>
      <h1 className="page-title">Brand approvals</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Every product that needs approval, grouped by brand, from each product&apos;s latest result. A brand marked approved counts as open at gate 11 the next time a run is screened or re-screened.
      </p>
    </div>
  );
  if (error) return <div className="space-y-5">{header}<p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">Couldn&apos;t load brands: {error}</p></div>;
  if (!brands) return <div className="space-y-5">{header}<div className="panel space-y-3 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div></div>;

  const worth = brands.filter((b) => b.passFees > 0).length;

  return (
    <div className="space-y-5">
      {header}

      {!brands.length && (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><BuildingIcon className="size-5" /></span>
          <div>
            <p className="section-title">No approval-needed products</p>
            <p className="mt-1 text-sm text-muted-foreground">Brands appear here once gating finds a listing you need approval for.</p>
          </div>
        </div>
      )}

      {brands.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Find a brand" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a brand" />
          </div>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={show} onValueChange={(v) => v && setShow(v as typeof show)} aria-label="Show">
            <ToggleGroupItem value="all" className="px-3 text-xs">All</ToggleGroupItem>
            <ToggleGroupItem value="awaiting" className="px-3 text-xs">Awaiting</ToggleGroupItem>
            <ToggleGroupItem value="approved" className="px-3 text-xs">Approved</ToggleGroupItem>
            <ToggleGroupItem value="refused" className="px-3 text-xs">Refused</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-sm text-muted-foreground"><span className="num font-medium text-foreground">{worth}</span> of {brands.length} brands have products that clear the fee engine</span>
        </div>
      )}

      {brands.length > 0 && (
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Brand</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Pass fees</TableHead>
                <TableHead>Apply</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-16 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!shown.length && (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No brands match.</TableCell></TableRow>
              )}
              {shown.map((b) => {
                const d = drafts[b.key];
                const isOpen = open.has(b.key);
                return (
                  <Fragment key={b.key}>
                    <TableRow className="align-top">
                      <TableCell className="pl-2 whitespace-normal">
                        <Button variant="ghost" size="sm" className="h-auto justify-start px-2 py-1 text-left font-medium" aria-expanded={isOpen}
                          onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(b.key)) n.delete(b.key); else n.add(b.key); return n; })}>
                          <ChevronRightIcon className={cn("transition-transform", isOpen && "rotate-90")} /> {b.brand}
                        </Button>
                        <div className="pl-8 text-xs text-muted-foreground">{b.kinds.map((k) => (k === "unspecified" ? "approval" : `${k} approval`)).join(", ")}</div>
                      </TableCell>
                      <TableCell className="num pt-3 text-right">{b.products.length}</TableCell>
                      <TableCell className={cn("num pt-3 text-right font-semibold", b.passFees ? "text-pass" : "text-muted-foreground")}>{b.passFees}</TableCell>
                      <TableCell className="pt-2.5">
                        {b.applyUrl && (
                          <a href={b.applyUrl} target="_blank" rel="noreferrer noopener" title={b.applyTitle ?? "Request approval in Seller Central"}
                            className="inline-flex items-center gap-1 rounded border border-brand px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-brand hover:bg-brand-soft">
                            Apply on Amazon <ExternalLinkIcon className="size-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="min-w-56">
                        <Input placeholder="e.g. 3 invoices, 30 units" defaultValue={d.requirement} aria-label={`${b.brand} requirement`}
                          onBlur={(e) => e.target.value !== d.requirement && save(b, { requirement: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <NativeSelect className={cn("w-36 font-medium", STATUS_STYLE[d.status])} value={d.status} aria-label={`${b.brand} status`}
                          onChange={(e) => save(b, { status: e.target.value as ApprovalStatus, status_date: d.status_date || new Date().toISOString().slice(0, 10) })}>
                          {APPROVAL_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{STATUS_LABELS[s]}</NativeSelectOption>)}
                        </NativeSelect>
                      </TableCell>
                      <TableCell>
                        <Input className="num w-36" type="date" value={d.status_date} aria-label={`${b.brand} date`}
                          onChange={(e) => save(b, { status_date: e.target.value })} />
                      </TableCell>
                      <TableCell className="pt-3 pr-4 text-xs">
                        {saved[b.key] === "saving" ? <span className="text-muted-foreground">Saving…</span>
                          : saved[b.key] === "saved" ? <span className="inline-flex items-center gap-1 text-pass"><CheckIcon className="size-3" /> Saved</span>
                          : saved[b.key] ? <span className="text-fail whitespace-normal">{saved[b.key]}</span> : null}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={8} className="px-10 py-2 whitespace-normal">
                          <ul className="space-y-0.5 text-xs">
                            {b.products.map((p) => (
                              <li key={`${p.ean}-${p.asin}`} className="flex gap-2">
                                <span className={p.passesFees ? "text-pass" : "text-muted-foreground"}>{p.passesFees ? "✓ passes fees" : "✕ fails fees"}</span>
                                <span className="num text-muted-foreground">{p.asin ? <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${p.asin}`} target="_blank" rel="noreferrer">{p.asin}</a> : p.ean}</span>
                                <span className="truncate">{p.title}</span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
