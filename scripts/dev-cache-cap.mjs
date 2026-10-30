#!/usr/bin/env node
/**
 * Runs before `npm run dev`: clears .next/dev when it's grown past a cap (default 3 GB).
 * Turbopack's dev cache (turbopackFileSystemCacheForDev, on by default) has no size limit and
 * reached 10 GB here. Below the cap it's kept, so restarts stay warm.
 *
 *   DEV_CACHE_MAX_GB=5 npm run dev   another cap
 */
import { lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = ".next/dev";
const maxBytes = Number(process.env.DEV_CACHE_MAX_GB || 3) * 1024 ** 3;

let total = 0;
try {
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    total += lstatSync(join(e.parentPath, e.name)).size;
    if (total > maxBytes) break;
  }
} catch {
  process.exit(0); // no .next/dev yet
}
if (total > maxBytes) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`Cleared ${dir}: over ${maxBytes / 1024 ** 3} GB (the next start compiles from cold).`);
}
