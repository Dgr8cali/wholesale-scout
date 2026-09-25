"use client";

import { Fragment, useEffect, useState } from "react";
import { APPROVAL_STATUSES, STATUS_LABELS, type ApprovalStatus, type BrandRow } from "@/lib/brands";
import { api } from "@/lib/ui/client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
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

  if (error) return <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>;
  if (!brands) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const worth = brands.filter((b) => b.passFees > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Brand approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every product that needs approval, grouped by brand, from each product&apos;s latest result. {worth} of {brands.length} brands
          have products that clear the fee engine. A brand marked approved counts as open at gate 11 the next time a run is screened or re-screened.
        </p>
      </div>

      {!brands.length && (
        <div className="panel px-6 py-10 text-center">
          <p className="section-title">No approval-needed products</p>
          <p className="mt-1 text-sm text-muted-foreground">Brands appear here once gating finds a listing you need approval for.</p>
        </div>
      )}

      {brands.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2 text-right">Products</th>
                <th className="px-3 py-2 text-right">Pass fees</th>
                <th className="px-3 py-2">Apply</th>
                <th className="px-3 py-2">Requirement</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => {
                const d = drafts[b.key];
                const isOpen = open.has(b.key);
                return (
                  <Fragment key={b.key}>
                    <tr className="border-b border-border align-top">
                      <td className="px-3 py-2">
                        <button className="text-left font-medium hover:text-brand" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(b.key)) n.delete(b.key); else n.add(b.key); return n; })}>
                          {isOpen ? "▾" : "▸"} {b.brand}
                        </button>
                        <div className="text-xs text-muted-foreground">{b.kinds.map((k) => (k === "unspecified" ? "approval" : `${k} approval`)).join(", ")}</div>
                      </td>
                      <td className="num px-3 py-2 text-right">{b.products.length}</td>
                      <td className={`num px-3 py-2 text-right font-semibold ${b.passFees ? "text-pass" : "text-muted-foreground"}`}>{b.passFees}</td>
                      <td className="px-3 py-2">
                        {b.applyUrl && (
                          <a href={b.applyUrl} target="_blank" rel="noreferrer noopener" title={b.applyTitle ?? "Request approval in Seller Central"}
                            className="inline-flex rounded border border-brand px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-brand hover:bg-brand-soft">
                            Apply on Amazon ↗
                          </a>
                        )}
                      </td>
                      <td className="min-w-56 px-3 py-2">
                        <Input  placeholder="e.g. 3 invoices, 30 units" defaultValue={d.requirement} aria-label={`${b.brand} requirement`}
                          onBlur={(e) => e.target.value !== d.requirement && save(b, { requirement: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <NativeSelect className={`w-36 font-medium ${STATUS_STYLE[d.status]}`} value={d.status} aria-label={`${b.brand} status`}
                          onChange={(e) => save(b, { status: e.target.value as ApprovalStatus, status_date: d.status_date || new Date().toISOString().slice(0, 10) })}>
                          {APPROVAL_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{STATUS_LABELS[s]}</NativeSelectOption>)}
                        </NativeSelect>
                      </td>
                      <td className="px-3 py-2">
                        <Input className="num w-36" type="date" value={d.status_date} aria-label={`${b.brand} date`}
                          onChange={(e) => save(b, { status_date: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {saved[b.key] === "saving" ? <span className="text-muted-foreground">Saving…</span>
                          : saved[b.key] === "saved" ? <span className="text-pass">Saved</span>
                          : saved[b.key] ? <span className="text-fail">{saved[b.key]}</span> : null}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-muted/50">
                        <td colSpan={8} className="px-6 py-2">
                          <ul className="space-y-0.5 text-xs">
                            {b.products.map((p) => (
                              <li key={`${p.ean}-${p.asin}`} className="flex gap-2">
                                <span className={p.passesFees ? "text-pass" : "text-muted-foreground"}>{p.passesFees ? "✓ passes fees" : "✕ fails fees"}</span>
                                <span className="num text-muted-foreground">{p.asin ? <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${p.asin}`} target="_blank" rel="noreferrer">{p.asin}</a> : p.ean}</span>
                                <span className="truncate">{p.title}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
