import type { NextRequest } from "next/server";
import { DEFAULT_RFQ_TEMPLATE, RFQ_PLACEHOLDERS } from "@/lib/pl/rfqTemplate";
import { handle } from "@/lib/server/http";
import { rfqTemplate, saveRfqTemplate } from "@/lib/server/plSuppliers";

/** The RFQ template in use, the default, and the placeholders it can use. */
export const GET = handle(async () => Response.json({ template: await rfqTemplate(), defaultTemplate: DEFAULT_RFQ_TEMPLATE, placeholders: RFQ_PLACEHOLDERS }));

/** { template } or { template: null } for the default. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { template?: string | null };
  return Response.json({ template: await saveRfqTemplate(b.template ?? null) });
});
