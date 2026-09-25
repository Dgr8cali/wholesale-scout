import { articles, meta } from "@/lib/help/load";

// Built once: the articles are files in the repo.
export const dynamic = "force-static";

/** Every article's title, section, route and gate: for the "?" button and gate links. */
export function GET() {
  return Response.json({ articles: articles().map(meta) });
}
