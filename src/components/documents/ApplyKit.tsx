"use client";

import { ExternalLinkIcon, FolderOpenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { applyOrder, staleInvoice, type DocumentRow } from "@/lib/documents";
import { api } from "@/lib/ui/client";
import { DocumentLine } from "./Documents";

/**
 * The Apply flow with your paperwork: the brand's documents and the supplier's invoices, and one
 * button that downloads them all and opens Amazon's application, so applying is one click.
 */
export function ApplyKit({ brand, supplierId, applyUrl, compact = false }: { brand: string | null | undefined; supplierId?: string | null; applyUrl: string; compact?: boolean }) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || docs) return;
    const q = new URLSearchParams({ apply: "1", ...(brand ? { brand } : {}), ...(supplierId ? { supplier: supplierId } : {}) });
    api<{ documents: DocumentRow[] }>(`/api/documents?${q}`).then((r) => setDocs(applyOrder(r.documents))).catch(() => setDocs([]));
  }, [open, docs, brand, supplierId]);
  const usable = (docs ?? []).filter((d) => staleInvoice(d) == null);

  function applyNow() {
    // Downloads first (each a link to a 60-second signed URL), then Amazon's form in a new tab.
    usable.forEach((d, i) => setTimeout(() => {
      const a = document.createElement("a");
      a.href = `/api/documents/${d.id}/file?download=1`;
      a.click();
    }, i * 400));
    window.open(applyUrl, "_blank", "noopener");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={compact ? "xs" : "default"} onClick={(e) => e.stopPropagation()}>
          <FolderOpenIcon /> Apply kit
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">Apply{brand ? ` for ${brand}` : ""}</p>
        {docs == null ? <p className="text-sm text-muted-foreground">Loading…</p> : docs.length ? (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">{docs.map((d) => <DocumentLine key={d.id} d={d} />)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents yet. Attach invoices and brand letters on the brand&apos;s or the supplier&apos;s page.</p>
        )}
        <Button className="w-full" onClick={applyNow}>
          {usable.length ? `Download ${usable.length} document${usable.length === 1 ? "" : "s"} and apply on Amazon` : "Apply on Amazon"} <ExternalLinkIcon />
        </Button>
        {docs != null && usable.length < docs.length && (
          <p className="text-xs text-muted-foreground">Invoices over 180 days old are left out of the download.</p>
        )}
        {usable.length > 1 && <p className="text-xs text-muted-foreground">Your browser may ask once to allow several downloads.</p>}
      </PopoverContent>
    </Popover>
  );
}
