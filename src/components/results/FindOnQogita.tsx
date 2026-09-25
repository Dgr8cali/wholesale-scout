"use client";

import { ExternalLinkIcon, LoaderIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/ui/client";

interface Found { name: string; brand: string | null; price: { amount: number; currency: string } | null; unit: number | null; inventory: number | null; url: string }

/** "Find on Qogita": Qogita's in-stock offers for this EAN, for a product found without a supplier. */
export function FindOnQogita({ ean }: { ean: string }) {
  const [state, setState] = useState<{ busy: boolean; found?: Found[]; error?: string }>({ busy: false });
  async function find() {
    setState({ busy: true });
    try {
      const r = await api<{ products: Found[] }>(`/api/qogita/find?gtin=${encodeURIComponent(ean)}`);
      setState({ busy: false, found: r.products });
    } catch (e) {
      setState({ busy: false, error: (e as Error).message });
    }
  }
  const money = (p: Found["price"]) => (p ? `${p.currency === "EUR" ? "€" : p.currency === "GBP" ? "£" : `${p.currency} `}${p.amount.toFixed(2)}` : "—");
  return (
    <div className="mt-2 text-xs">
      {!state.found && (
        <button type="button" className="inline-flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-50" disabled={state.busy}
          onClick={(e) => { e.stopPropagation(); void find(); }}>
          {state.busy ? <LoaderIcon className="size-3 animate-spin" /> : <SearchIcon className="size-3" />} Find on Qogita (EAN {ean})
        </button>
      )}
      {state.error && <p className="text-fail">{state.error}</p>}
      {state.found && (state.found.length ? (
        <ul className="space-y-0.5">
          <li className="text-muted-foreground">On Qogita (in stock, EAN {ean}):</li>
          {state.found.slice(0, 5).map((p, i) => (
            <li key={i}>
              <a className="inline-flex items-center gap-1 font-medium text-brand hover:underline" href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                {p.name} <ExternalLinkIcon className="size-3" />
              </a>
              <span className="num text-muted-foreground"> · {money(p.price)}{p.unit && p.unit > 1 ? ` (case of ${p.unit})` : ""}{p.inventory != null ? ` · ${p.inventory.toLocaleString("en-GB")} in stock` : ""}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-muted-foreground">Not on Qogita in stock (EAN {ean}).</p>)}
    </div>
  );
}
