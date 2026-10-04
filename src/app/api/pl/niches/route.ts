import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { importNiches, listNiches, previewNicheImport } from "@/lib/server/plNiches";

export const maxDuration = 60;

/** Every imported niche (with its category), and the imports. */
export const GET = handle(async () => Response.json(await listNiches()));

/** { action: "preview" | "import", text, category, filename? }: an Opportunity Explorer niche download. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { action?: string; text?: string; category?: string; filename?: string };
  if (!b.text) return Response.json({ error: "No file" }, { status: 400 });
  try {
    if (b.action === "import") return Response.json(await importNiches({ text: b.text, category: b.category ?? "", filename: b.filename ?? null }));
    return Response.json(await previewNicheImport(b.text, b.category ?? ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
