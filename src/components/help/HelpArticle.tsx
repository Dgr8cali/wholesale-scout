"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { helpLinkTarget } from "./HelpPanel";

type Ref = { slug: string; title: string } | null;

/** One article as a page, with the previous and next in its section. */
export function HelpArticle({ title, summary, section, html, prev, next }: { slug: string; title: string; summary: string; section: string; html: string; prev: Ref; next: Ref }) {
  const router = useRouter();
  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={title} crumbs={[{ label: "Help", href: "/help" }, { label: title }]} subtitle={summary ? `${section} · ${summary}` : section} />
      <div
        className="help-prose"
        // Links to other articles move without a full page load.
        onClick={(e) => {
          const t = helpLinkTarget(e);
          if (!t) return;
          e.preventDefault();
          router.push(`/help/${t.slug}${t.hash ? `#${t.hash}` : ""}`);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {(prev || next) && (
        <nav className="flex justify-between gap-4 border-t border-divider pt-4 text-sm" aria-label="More in this section">
          {prev ? <Link href={`/help/${prev.slug}`} className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeftIcon className="size-4" />{prev.title}</Link> : <span />}
          {next ? <Link href={`/help/${next.slug}`} className="inline-flex items-center gap-1 text-primary hover:underline">{next.title}<ArrowRightIcon className="size-4" /></Link> : <span />}
        </nav>
      )}
    </article>
  );
}
