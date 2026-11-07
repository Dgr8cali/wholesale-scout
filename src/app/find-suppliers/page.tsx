"use client";

import { ExternalLinkIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { ChipToggle } from "@/components/ui/chip-toggle";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { countryName, priceLine, priceSortValue, type SearchKind, type SupplierResult, type SupplierSearch } from "@/lib/supplierSearch/display";
import { api, when } from "@/lib/ui/client";

type Recent = Pick<SupplierSearch, "id" | "query" | "kind" | "status" | "created_at">;

const POLL_MS = 3_000;
const RETRY_MS = 10_000;
const KIND_LABEL: Record<SearchKind, string> = { wholesale: "Wholesalers", manufacturer: "Manufacturers" };
const TYPE_LABEL: Record<SupplierResult["type"], string> = { manufacturer: "Manufacturer", wholesaler: "Wholesaler", distributor: "Distributor", marketplace: "Marketplace", retailer: "Retailer", unknown: "Unknown" };

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

const columns: DataColumn<SupplierResult>[] = [
  {
    id: "supplier", header: "Supplier", mobile: "title", sortValue: (r) => r.supplier,
    cell: (r) => <>
      <a className="font-medium hover:underline" href={r.url} target="_blank" rel="noopener noreferrer">
        {r.supplier}<ExternalLinkIcon aria-hidden className="ml-1 inline size-3 text-muted-foreground" />
      </a>
      <p className="text-xs font-normal text-muted-foreground">{hostOf(r.url)}</p>
    </>,
  },
  {
    id: "type", header: "Type", mobile: 1, sortValue: (r) => TYPE_LABEL[r.type],
    cell: (r) => <>
      {TYPE_LABEL[r.type]}
      {r.typeEvidence && <p className="max-w-64 text-xs font-normal text-muted-foreground">“{r.typeEvidence}”</p>}
    </>,
  },
  {
    id: "country", header: "Based in", mobile: 2, sortValue: (r) => (r.country ? countryName(r.country) : null),
    cell: (r) => <>
      {r.opened ? countryName(r.country) : "Not opened"}
      {r.countryEvidence && <p className="max-w-56 text-xs font-normal text-muted-foreground">“{r.countryEvidence}”</p>}
    </>,
  },
  {
    id: "price", header: "Price", mobile: 3, numeric: true, sortValue: priceSortValue,
    cell: (r) => {
      const line = priceLine(r);
      if (!line) return <span className="text-muted-foreground">{r.opened ? "On request or not shown" : "Open the page"}</span>;
      return <>
        {line.main}
        {line.unit && <p className="text-xs font-normal text-muted-foreground">{line.unit}</p>}
        {r.priceProduct && <p className="max-w-56 text-xs font-normal text-muted-foreground">For {r.priceProduct}</p>}
        <p className="text-xs font-normal text-warn-ink">Check on page</p>
      </>;
    },
  },
  { id: "moq", header: "Minimum order", sortValue: (r) => r.moq, cell: (r) => (r.moq != null ? `${r.moq}${r.moqUnit ? ` ${r.moqUnit}` : ""}` : "—") },
  { id: "vat", header: "VAT", cell: (r) => (r.vat === "ex" ? "Excluded" : r.vat === "inc" ? "Included" : "—") },
];

/** Search the web for suppliers of a product, then filter what comes back. */
export default function FindSuppliersPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind>("wholesale");
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [search, setSearch] = useState<SupplierSearch | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [country, setCountry] = useState("");
  const [hideRetailers, setHideRetailers] = useState(true);
  const [onlyPriced, setOnlyPriced] = useState(false);

  const loadRecent = () => api<{ searches: Recent[] }>("/api/supplier-searches").then((r) => { setRecent(r.searches); return r.searches; });

  useEffect(() => {
    loadRecent().then((s) => { if (s[0]) setCurrent(s[0].id); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const { search: s } = await api<{ search: SupplierSearch }>(`/api/supplier-searches/${current}`);
        if (cancelled) return;
        setError(null);
        setSearch(s);
        if (s.status === "running") timer = setTimeout(poll, POLL_MS);
        else loadRecent().catch(() => {});
      } catch (e) {
        if (cancelled) return;
        // A blip or a deploy shouldn't lose a search that's still running on the server.
        setError(`${(e as Error).message} Trying again.`);
        timer = setTimeout(poll, RETRY_MS);
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [current]);

  const show = (id: string) => {
    setSearch(null); setError(null); setType(""); setCountry(""); setOnlyPriced(false);
    setCurrent(id);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true); setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/supplier-searches", { method: "POST", json: { query, kind } });
      show(id);
      await loadRecent();
    } catch (err) { setError((err as Error).message); } finally { setStarting(false); }
  };

  const rows = useMemo(() => search?.results ?? [], [search]);
  const countries = useMemo(() => [...new Set(rows.map((r) => countryName(r.country)))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))], [rows]);
  const retailers = rows.filter((r) => r.type === "retailer").length;
  const shown = rows.filter((r) => (!type || r.type === type) && (!country || countryName(r.country) === country)
    && (!hideRetailers || r.type !== "retailer" || type === "retailer") && (!onlyPriced || r.price != null));

  return <>
    <PageHeader
      title="Find suppliers"
      crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Find suppliers" }]}
      subtitle="Search the web for wholesalers or manufacturers of a product. Each search takes a minute or two and costs about 20 cents."
      info={<>
        <p>Every type, country and price is read from the supplier&apos;s own page. Check a price on the page before relying on it.</p>
        <p>Marketplaces such as Alibaba are listed but not opened.</p>
      </>}
    />
    <form onSubmit={start} className="mt-4 mb-4 flex flex-wrap items-center gap-2">
      <Input className="min-w-0 flex-1 basis-64" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Product, for example black bin bags" aria-label="Product" maxLength={120} />
      <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as SearchKind)} aria-label="Looking for">
        {(Object.keys(KIND_LABEL) as SearchKind[]).map((k) => <NativeSelectOption key={k} value={k}>{KIND_LABEL[k]}</NativeSelectOption>)}
      </NativeSelect>
      <Button type="submit" loading={starting} disabled={query.trim().length < 2}><SearchIcon aria-hidden />Search</Button>
    </form>

    {error && <ErrorState message={error} compact />}
    {!recent && !error && <TableSkeleton />}
    {recent && !recent.length && !search && (
      <EmptyState icon={<SearchIcon />} title="No searches yet">Type a product above to find suppliers for it.</EmptyState>
    )}

    {recent && recent.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect value={current ?? ""} onChange={(e) => show(e.target.value)} aria-label="Earlier searches">
          {recent.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.query} · {KIND_LABEL[s.kind]} · {when(s.created_at)}</NativeSelectOption>)}
        </NativeSelect>
      </div>
    )}

    {search?.status === "running" && (
      <div role="status" className="mb-4 flex flex-col gap-2">
        <p className="font-medium">Searching for {search.query} and reading supplier pages.</p>
        <p className="text-meta text-muted-foreground">This usually takes a minute or two. You can leave this page and come back.</p>
        <TableSkeleton />
      </div>
    )}
    {search?.status === "failed" && <ErrorState title="That search didn't finish" message={search.error ?? undefined} compact />}

    {search?.status === "done" && <>
      {search.warnings.map((w) => <p key={w} className="mb-2 text-meta text-warn-ink">{w}</p>)}
      {search.stats && (
        <p className="mb-3 text-meta text-muted-foreground">
          Read {search.stats.read} pages. {search.stats.failed} wouldn&apos;t load, {search.stats.blocked} asked not to be read, and {search.stats.notOpened} on marketplaces weren&apos;t opened. Cost ${Number(search.cost_usd).toFixed(2)}.
        </p>
      )}
      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Supplier type">
            <NativeSelectOption value="">All types</NativeSelectOption>
            {types.map((t) => <NativeSelectOption key={t} value={t}>{TYPE_LABEL[t]}</NativeSelectOption>)}
          </NativeSelect>
          <NativeSelect value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <NativeSelectOption value="">All countries</NativeSelectOption>
            {countries.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect>
          <ChipToggle pressed={onlyPriced} onPressedChange={setOnlyPriced}>Has a price</ChipToggle>
          {retailers > 0 && <ChipToggle pressed={hideRetailers} onPressedChange={setHideRetailers}>Hide retailers · {retailers}</ChipToggle>}
          <span className="text-meta text-muted-foreground">{shown.length} of {rows.length}</span>
        </div>
      )}
      <DataTable
        rows={shown} columns={columns} getRowId={(r) => r.url} paged={false}
        empty={{ icon: <SearchIcon />, title: rows.length ? "Nothing matches these filters" : "No suppliers found", description: rows.length ? "Clear a filter to see more." : "Try a shorter or more general product name." }}
      />
    </>}
  </>;
}
