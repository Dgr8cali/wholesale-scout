import { notFound } from "next/navigation";
import { article, articles, render } from "@/lib/help/load";
import { HelpArticle } from "@/components/help/HelpArticle";

export function generateStaticParams() {
  return articles().map((a) => ({ slug: a.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps<"/help/[...slug]">) {
  const a = article((await params).slug.join("/"));
  return { title: a ? `${a.title} · Help · Wholesale Scout` : "Help · Wholesale Scout" };
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[...slug]">) {
  const a = article((await params).slug.join("/"));
  if (!a) notFound();
  // Neighbours in the same section, for reading on.
  const same = articles().filter((x) => x.section === a.section);
  const i = same.findIndex((x) => x.slug === a.slug);
  const link = (x: (typeof same)[number] | undefined) => (x ? { slug: x.slug, title: x.title } : null);
  return (
    <HelpArticle
      slug={a.slug} title={a.title} summary={a.summary} section={a.section} html={render(a)}
      prev={link(same[i - 1])} next={link(same[i + 1])}
    />
  );
}
