import { article, articles, render } from "@/lib/help/load";

export const dynamic = "force-static";

export function generateStaticParams() {
  return articles().map((a) => ({ slug: a.slug.split("/") }));
}

/** One article as HTML, for the side panel. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const a = article((await ctx.params).slug.join("/"));
  if (!a) return Response.json({ error: "No such article" }, { status: 404 });
  return Response.json({ slug: a.slug, title: a.title, summary: a.summary, section: a.section, html: render(a) });
}
