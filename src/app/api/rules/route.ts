import type { CategoryRule } from "@/lib/screening/rules";
import { db, loadRules, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => Response.json({ rules: await loadRules() }));

/** Replace the whole rule set (the Settings page edits them together). */
export const PUT = handle(async (req: Request) => {
  const { rules } = (await req.json()) as { rules: CategoryRule[] };
  if (!Array.isArray(rules)) return Response.json({ error: "rules must be a list" }, { status: 400 });
  const keys = new Set<string>();
  for (const r of rules) {
    if (!r.key?.match(/^[a-zA-Z0-9_]+$/)) return Response.json({ error: `Rule key "${r.key}" must be letters, digits or _` }, { status: 400 });
    if (keys.has(r.key)) return Response.json({ error: `Duplicate rule key ${r.key}` }, { status: 400 });
    keys.add(r.key);
  }
  const rows = rules.map((r, i) => ({
    key: r.key, name: r.name || r.key, keywords: r.keywords ?? [], amazon_categories: r.amazon_categories ?? [],
    note: r.note ?? null, checklist: r.checklist ?? [], sort: i, updated_at: new Date().toISOString(),
  }));
  const existing = must(await db().from("category_rules").select("key"), "rules") as { key: string }[];
  const gone = existing.map((e) => e.key).filter((k) => !keys.has(k));
  if (gone.length) must(await db().from("category_rules").delete().in("key", gone), "delete rules");
  must(await db().from("category_rules").upsert(rows, { onConflict: "key" }), "save rules");
  return Response.json({ ok: true });
});
