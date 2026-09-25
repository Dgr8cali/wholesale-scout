/**
 * Test double for the slice of the Supabase query builder the server code uses.
 * In-memory tables, uuid ids, unique checks for the keys ingest and process rely on.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const UNIQUE: Record<string, string[][]> = {
  suppliers: [["name"]],
  supplier_mappings: [["supplier_id", "header_fingerprint"]],
  products: [["ean", "asin"]],
  profiles: [["name"]],
  results: [["run_id", "product_id"]],
  category_rules: [["key"]],
};

const DEFAULTS: Record<string, Row> = {
  products: { asin: null, compliance_flags: [], catalog_updated_at: null, keepa_updated_at: null, dims_cm: null, weight_g: null, category: null, referral_category: null, sales_rank: null, variation_count: null, parent_asin: null },
  suppliers: { vat_basis: "ex_vat", vat_rate: 20, currency: "GBP", mov: null, delivery_days: null, rating: null },
  runs: { status: "pending", processed_count: 0, token_cost: 0, row_count: 0 },
  results: { status: "pending", offer_count: 1 },
  profiles: { is_default: false },
};

/** Column or JSON path (`inputs->>stage`) value, as PostgREST reads it. */
function get(r: Row, c: string): unknown {
  const m = c.match(/^(\w+)->>(\w+)$/);
  if (!m) return r[c];
  const v = (r[m[1]] as Record<string, unknown> | null | undefined)?.[m[2]];
  return v == null ? undefined : String(v);
}

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Inserts into these tables fail, to test what happens when a write is refused. */
  failInserts = new Set<string>();
  /** Columns a table doesn't have yet (an unapplied migration), as PostgREST reports them. */
  missingColumns: Record<string, string[]> = {};
  from(table: string) {
    this.tables[table] ??= [];
    return new Query(this, table);
  }
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] | Row | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean; count?: string; head?: boolean } = {};
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private orderBy: { col: string; asc: boolean } | null = null;
  private lim: number | null = null;
  private rng: [number, number] | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") Object.assign(this.opts, opts ?? {});
    else this.returning = true;
    return this;
  }
  insert(rows: Row[] | Row) { this.op = "insert"; this.payload = rows; return this; }
  upsert(rows: Row[] | Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.op = "upsert"; this.payload = rows; this.opts = { ...opts }; return this; }
  update(row: Row) { this.op = "update"; this.payload = row; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => get(r, c) === v); return this; }
  /** PostgREST or(): only the forms the app uses, `col.is.null` and `col.lt.value`. */
  or(expr: string) {
    const parts = expr.split(",").map((p) => p.split("."));
    this.filters.push((r) => parts.some(([col, op, ...rest]) => {
      const v = r[col];
      if (op === "is") return v == null;
      if (op === "lt") return v != null && String(v) < rest.join(".");
      return false;
    }));
    return this;
  }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending ?? true }; return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private rows() { return this.db.tables[this.table]; }

  private conflict(row: Row, keys?: string[]): Row | undefined {
    const sets = keys ? [keys] : UNIQUE[this.table] ?? [];
    for (const k of sets) {
      const hit = this.rows().find((r) => k.every((c) => (r[c] ?? null) === (row[c] ?? null)));
      if (hit) return hit;
    }
    return undefined;
  }

  private exec(): { data: unknown; error: { message: string; code?: string } | null; count?: number | null } {
    let out: Row[] = [];
    const now = new Date().toISOString();
    if ((this.op === "insert" || this.op === "upsert") && this.db.failInserts.has(this.table)) {
      return { data: null, error: { message: "request entity too large" } };
    }
    const missing = this.db.missingColumns[this.table] ?? [];
    if ((this.op === "insert" || this.op === "upsert") && missing.length) {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const col = missing.find((c) => rows.some((r) => c in r));
      if (col) return { data: null, error: { message: `Could not find the '${col}' column of '${this.table}' in the schema cache` } };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const p of list) {
        const keys = this.opts.onConflict?.split(",");
        const hit = this.conflict(p, this.op === "upsert" ? keys : undefined);
        if (hit && this.op === "insert") return { data: null, error: { message: "duplicate key", code: "23505" } };
        if (hit) {
          if (!this.opts.ignoreDuplicates) Object.assign(hit, p);
          out.push(hit);
          continue;
        }
        const row = { id: uuid(), created_at: now, ...(this.table === "keepa_snapshots" ? { fetched_at: now } : {}), ...DEFAULTS[this.table], ...p };
        this.rows().push(row);
        out.push(row);
      }
      if (!this.returning) out = [];
    } else {
      let rows = this.rows().filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") rows.forEach((r) => Object.assign(r, this.payload));
      if (this.op === "delete") this.db.tables[this.table] = this.rows().filter((r) => !rows.includes(r));
      if (this.op === "select" && this.opts.head) return { data: null, error: null, count: rows.length };
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort((a, b) => ((a[col] as number) < (b[col] as number) ? -1 : (a[col] as number) > (b[col] as number) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      out = this.op === "select" || this.returning ? rows : [];
    }
    const copy = JSON.parse(JSON.stringify(out)) as Row[];
    if (this.mode === "single") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: `expected 1 row, got ${copy.length}` } };
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null };
  }

  then<A, B>(ok?: ((v: ReturnType<Query["exec"]>) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.exec()).then(ok, bad);
  }
}
