"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { Input } from "@/components/ui/input";
import { anchor, search, type SearchDoc } from "@/lib/help/catalog";

/** The Help page: a search box over every article, and the articles by section. */
export function HelpHome({ docs, sections }: { docs: SearchDoc[]; sections: string[] }) {
  usePageCrumbs([{ label: "Help" }]);
  const [q, setQ] = useState("");
  const hits = useMemo(() => search(docs, q), [docs, q]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Help</h1>
        <p className="text-sm text-muted-foreground">How each page, gate and number works, written from the app as it is. Every page&apos;s <b>?</b> (top bar) opens its article.</p>
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: a page, a gate, a term (e.g. hurdle price, ungate, tokens)…" className="h-10 pl-9" aria-label="Search help" />
      </div>
      {q.trim() ? (
        hits.length ? (
          <ul className="space-y-2" aria-label="Search results">
            {hits.map(({ doc, snippet, heading }) => (
              <li key={doc.slug}>
                <Link href={`/help/${doc.slug}${heading ? `#${anchor(heading)}` : ""}`} className="block rounded-lg border p-3 hover:bg-muted/50">
                  <p className="text-sm font-medium">
                    {heading ? <>{heading} <span className="font-normal text-muted-foreground">· in {doc.title}</span></> : doc.title}
                    <span className="font-normal text-muted-foreground"> · {doc.section}</span>
                  </p>
                  {doc.summary && <p className="text-xs text-muted-foreground">{doc.summary}</p>}
                  {snippet && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{snippet}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nothing matches &ldquo;{q}&rdquo;. Try fewer or different words.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {sections.map((s) => {
            const list = docs.filter((d) => d.section === s);
            if (!list.length) return null;
            return (
              <section key={s} className="space-y-2">
                <h2 className="section-title">{s}</h2>
                <ul className="space-y-1.5">
                  {list.map((d) => (
                    <li key={d.slug}>
                      <Link href={`/help/${d.slug}`} className="text-sm font-medium text-brand hover:underline">{d.title}</Link>
                      {d.summary && <p className="text-xs text-muted-foreground">{d.summary}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
