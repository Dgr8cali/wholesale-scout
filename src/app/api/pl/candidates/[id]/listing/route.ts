import type { NextRequest } from "next/server";
import type { ListingDraft, ListingField } from "@/lib/pl/listing";
import { handle } from "@/lib/server/http";
import { generateListing, listingView, regenerateField, restoreListing, saveListingEdit, saveListingSettings, type ListingSettings } from "@/lib/server/plListing";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 120;

/** The Listing step: its inputs, settings, versions and the latest's checks (no model call). */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => Response.json(await listingView((await ctx.params).id)));

/**
 * { action: "generate", force? } writes the listing (one model call, cached by its inputs);
 * { action: "regenerate", field, draft } rewrites one field; { action: "save", draft } saves your
 * edit; { action: "restore", version }; { action: "settings", settings }. Each makes a new version.
 */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { action?: string; force?: boolean; field?: ListingField; draft?: ListingDraft; version?: number; settings?: Partial<ListingSettings> };
  try {
    switch (b.action) {
      case "generate": return Response.json(await generateListing(id, { force: !!b.force }));
      case "regenerate": if (!b.field || !b.draft) break; return Response.json(await regenerateField(id, b.field, b.draft));
      case "save": if (!b.draft) break; return Response.json(await saveListingEdit(id, b.draft));
      case "restore": if (b.version == null) break; return Response.json(await restoreListing(id, Number(b.version)));
      case "settings": return Response.json({ settings: await saveListingSettings(id, b.settings ?? {}) });
    }
    return Response.json({ error: "action: generate, regenerate (field, draft), save (draft), restore (version) or settings" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
