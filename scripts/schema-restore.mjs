#!/usr/bin/env node
/**
 * Apply a schema dump (scripts/schema-backup.mjs) to a database: a new Supabase project, or the
 * same one after damage. Every statement is safe to re-run, so it never drops or changes data
 * that's there; it creates what's missing. One transaction: all of it or none.
 *
 *   npm run schema:restore                 supabase/schema.sql into RESTORE_DATABASE_URL, else DATABASE_URL (asks first)
 *   npm run schema:restore -- --file <f>   another dump
 *   npm run schema:restore -- --yes        don't ask
 *   npm run schema:restore -- --check      restore into an empty scratch schema and roll back:
 *                                          proves the dump rebuilds the tables, changes nothing
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const file = arg("--file") ?? "supabase/schema.sql";
const check = process.argv.includes("--check");
const url = process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set RESTORE_DATABASE_URL (or DATABASE_URL) to the target database.");
  process.exit(1);
}
const host = (() => { try { return new URL(url).hostname; } catch { return "the database"; } })();
const dump = readFileSync(file, "utf8");

/** The dump's sections, by their "-- @section" markers. */
const sections = new Map();
let cur = "head";
for (const line of dump.split("\n")) {
  const m = line.match(/^-- @section (\w+)/);
  if (m) cur = m[1];
  sections.set(cur, `${sections.get(cur) ?? ""}${line}\n`);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  if (check) {
    // An empty schema stands in for a new database; Supabase's own parts are left out.
    const body = ["tables", "constraints", "indexes", "functions", "triggers"].map((s) => sections.get(s) ?? "").join("\n");
    await sql.begin(async (tx) => {
      await tx.unsafe("create schema restore_check; set local search_path = restore_check, extensions, public;");
      await tx.unsafe(body);
      const [n] = await tx`select count(*)::int n from pg_tables where schemaname = 'restore_check'`;
      console.log(`Check passed: the dump rebuilt ${n.n} tables in an empty schema (rolled back, nothing changed).`);
      throw new Error("__rollback__");
    }).catch((e) => { if (e.message !== "__rollback__") throw e; });
  } else {
    if (!process.argv.includes("--yes")) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const a = await rl.question(`Apply ${file} to ${host}? It only creates what's missing. Type RESTORE to go on: `);
      rl.close();
      if (a.trim() !== "RESTORE") { console.log("Nothing done."); process.exit(0); }
    }
    await sql.begin((tx) => tx.unsafe(dump));
    console.log(`Restored ${file} to ${host}.`);
  }
} catch (e) {
  console.error(`Restore failed, nothing applied: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
