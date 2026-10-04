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
  favourites: [["ean", "asin"]],
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

/** Numbers compare as numbers (a numeric column comes back as a number or a numeric string), else as text. */
function cmp(a: unknown, b: unknown): number {
  const x = Number(a), y = Number(b);
  if (a !== "" && b !== "" && a != null && b != null && Number.isFinite(x) && Number.isFinite(y) && typeof a !== "boolean") return x < y ? -1 : x > y ? 1 : 0;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
/** A LIKE pattern (% and _; ilike's * as %) as a regular expression. */
function likeRe(pattern: string, insensitive = false): RegExp {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".")}$`, insensitive ? "is" : "s");
}

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Inserts into these tables fail, to test what happens when a write is refused. */
  failInserts = new Set<string>();
  /** Columns a table doesn't have yet (an unapplied migration), as PostgREST reports them. */
  missingColumns: Record<string, string[]> = {};
  /**
   * PostgREST's max-rows: a select returns at most this many rows (Supabase's default, 1,000),
   * whatever its range; an exact count still counts them all. Code that needs more must page.
   */
  maxRows = 1000;
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
  private orderBy: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
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
      if (op === "ilike") return v != null && likeRe(rest.join("."), true).test(String(v));
      return false;
    }));
    return this;
  }
  not(c: string, op: "is" | "ov" | "eq", v: unknown) {
    if (op === "ov") {
      // A Postgres array literal: {a,b}.
      const vs = String(v).replace(/^\{|\}$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).filter(Boolean);
      this.filters.push((r) => !(Array.isArray(r[c]) && vs.some((x) => (r[c] as unknown[]).includes(x))));
    } else if (op === "eq") this.filters.push((r) => get(r, c) !== v);
    else this.filters.push((r) => (r[c] ?? null) !== v);
    return this;
  }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(get(r, c))); return this; }
  gte(c: string, v: string | number) { this.filters.push((r) => r[c] != null && cmp(r[c], v) >= 0); return this; }
  lte(c: string, v: string | number) { this.filters.push((r) => r[c] != null && cmp(r[c], v) <= 0); return this; }
  ilike(c: string, pattern: string) { const re = likeRe(pattern, true); this.filters.push((r) => r[c] != null && re.test(String(r[c]))); return this; }
  like(c: string, pattern: string) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`);
    this.filters.push((r) => r[c] != null && re.test(String(r[c])));
    return this;
  }
  gt(c: string, v: string | number) { this.filters.push((r) => r[c] != null && cmp(r[c], v) > 0); return this; }
  lt(c: string, v: string | number) { this.filters.push((r) => r[c] != null && cmp(r[c], v) < 0); return this; }
  contains(c: string, vs: unknown[]) { this.filters.push((r) => Array.isArray(r[c]) && vs.every((v) => (r[c] as unknown[]).includes(v))); return this; }
  overlaps(c: string, vs: unknown[]) { this.filters.push((r) => Array.isArray(r[c]) && vs.some((v) => (r[c] as unknown[]).includes(v))); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => get(r, c) !== v); return this; }
  /** Several calls sort by each in turn; nulls go last ascending and first descending, as Postgres, unless nullsFirst says. */
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = o?.ascending ?? true;
    this.orderBy.push({ col, asc, nullsFirst: o?.nullsFirst ?? !asc });
    return this;
  }
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
      const total = rows.length;
      if (this.orderBy.length) {
        rows = [...rows].sort((a, b) => {
          for (const { col, asc, nullsFirst } of this.orderBy) {
            const x = a[col] ?? null, y = b[col] ?? null;
            if (x === null && y === null) continue;
            if (x === null) return nullsFirst ? -1 : 1;
            if (y === null) return nullsFirst ? 1 : -1;
            const c = cmp(x, y);
            if (c) return c * (asc ? 1 : -1);
          }
          return 0;
        });
      }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      if (this.op === "select") rows = rows.slice(0, this.db.maxRows);
      if (this.op === "select" && this.opts.count === "exact" && this.mode === "many") {
        return { data: JSON.parse(JSON.stringify(rows)) as Row[], error: null, count: total };
      }
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
