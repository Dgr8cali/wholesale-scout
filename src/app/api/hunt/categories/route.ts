import { handle } from "@/lib/server/http";
import { huntCategories } from "@/lib/server/hunt";

/** Look up Amazon UK's top-level categories from Keepa (1 token, once; kept after that). */
export const POST = handle(async () => Response.json(await huntCategories(true)));
