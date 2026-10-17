import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const out = process.argv[2];
const bucket = sb.storage.from("documents");

async function walk(prefix = "") {
  const { data, error } = await bucket.list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const e of data) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) { await walk(path); continue; }
    const { data: blob, error: dlErr } = await bucket.download(path);
    if (dlErr) { console.error("FAILED", path, dlErr.message); continue; }
    const dest = join(out, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await blob.arrayBuffer()));
    console.log("saved", path);
  }
}
await walk();
console.log("done");
