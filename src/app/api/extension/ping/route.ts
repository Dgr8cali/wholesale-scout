import { extJson, extOptions } from "@/lib/server/extension";

export const OPTIONS = extOptions;
/** The extension's "Test connection": reaching here means the password was accepted. */
export const GET = () => extJson({ ok: true, app: "wholesale-scout" });
