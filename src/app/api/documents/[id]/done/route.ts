import { handle } from "@/lib/server/http";
import { confirmUpload } from "@/lib/server/documents";

/** The browser's upload finished: check the file is in storage and list the document. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  try {
    return (await confirmUpload((await ctx.params).id)) ? Response.json({ ok: true }) : Response.json({ error: "No such document" }, { status: 404 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
});
