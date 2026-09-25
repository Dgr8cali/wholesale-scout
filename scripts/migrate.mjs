#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql in filename order, each once, recorded in
 * schema_migrations. Needs DATABASE_URL (Supabase → Connect → Session pooler URI).
 *
 *   npm run migrate              apply what's pending
 *   npm run migrate -- --status  list applied and pending, change nothing
 *   npm run migrate -- --mark <file>   record a file you applied by hand (SQL editor)
 *
 * First run on a database whose earlier migrations were applied by hand: every file
 * before BASELINE_BEFORE is recorded as applied without running it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DIR = join(process.cwd(), "supabase/migrations");
const BASELINE_BEFORE = "20260927000000";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL isn't set. Add the Supabase connection string (Project → Connect → Session pooler) to .env.local, or apply the SQL files in the Supabase SQL editor and record them with --mark.");
  process.exit(1);
}
const args = process.argv.slice(2);
const sql = postgres(url, { max: 1, onnotice: () => {} });
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

try {
  const [{ exists }] = await sql`select to_regclass('public.schema_migrations') is not null as exists`;
  if (!exists) {
    await sql`create table schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const [{ runs }] = await sql`select to_regclass('public.runs') is not null as runs`;
    if (runs) {
      const base = files.filter((f) => f < BASELINE_BEFORE);
      for (const f of base) await sql`insert into schema_migrations (name) values (${f}) on conflict do nothing`;
      console.log(`Recorded ${base.length} earlier migrations as already applied.`);
    }
  }
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (args[0] === "--status") {
    for (const f of files) console.log(`${applied.has(f) ? "applied " : "pending "} ${f}`);
  } else if (args[0] === "--mark") {
    const f = args[1];
    if (!files.includes(f)) throw new Error(`No migration named ${f}`);
    await sql`insert into schema_migrations (name) values (${f}) on conflict do nothing`;
    console.log(`Recorded ${f} as applied.`);
  } else {
    if (!pending.length) console.log("Nothing to apply.");
    for (const f of pending) {
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(DIR, f), "utf8"));
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      console.log(`Applied ${f}`);
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
