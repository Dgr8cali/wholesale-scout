import "server-only";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GATE_ORDER } from "../screening/config";
import { anchor, type Article } from "./catalog";
import { articles } from "./load";

/** The app's pages: "/" and each top-level folder of src/app with a page.tsx. */
export function appRoutes(appDir = join(process.cwd(), "src", "app")): string[] {
  const top = readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("(") && !e.name.startsWith("_") && e.name !== "api")
    .filter((e) => existsSync(join(appDir, e.name, "page.tsx")))
    .map((e) => `/${e.name}`);
  return ["/", ...top].sort();
}

/**
 * What's missing from the help centre: a page or gate with no article, the extension's article,
 * or a /help link that goes nowhere. Empty when complete (the build runs this; see package.json).
 */
export function helpProblems(all: Article[] = articles(), routes = appRoutes()): string[] {
  const problems: string[] = [];
  for (const r of routes) if (!all.some((a) => a.route === r)) problems.push(`page ${r} has no article (add one with "route: ${r}")`);
  for (const g of GATE_ORDER) if (!all.some((a) => a.gate === g)) problems.push(`gate ${g} has no article (add one with "gate: ${g}")`);
  if (!all.some((a) => a.slug === "pages/extension")) problems.push("the Chrome extension has no article (pages/extension.md)");
  const slugs = new Map(all.map((a) => [a.slug, a]));
  const headings = (a: Article) => new Set([...a.body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => anchor(m[1])));
  for (const a of all) {
    for (const m of a.body.matchAll(/\]\(\/help\/([^)#\s]+)(?:#([^)\s]+))?\)/g)) {
      const target = slugs.get(m[1]);
      if (!target) problems.push(`${a.slug}: link to /help/${m[1]}, which doesn't exist`);
      else if (m[2] && !headings(target).has(m[2])) problems.push(`${a.slug}: link to /help/${m[1]}#${m[2]}, which has no such heading`);
    }
  }
  return problems;
}
