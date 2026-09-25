/**
 * Results-table layout the user chooses: which columns show, their order and widths, and
 * row density. Kept in this browser (one per table), and tolerant of columns added or
 * removed since it was saved.
 */
export type Density = "comfortable" | "compact";

export interface TablePrefs {
  visibility: Record<string, boolean>;
  order: string[];
  sizing: Record<string, number>;
  density: Density;
}

export const defaultPrefs = (columns: string[]): TablePrefs => ({ visibility: {}, order: columns, sizing: {}, density: "comfortable" });

/**
 * Saved prefs made safe for the current columns: unknown ids dropped, new columns placed
 * where they sit in the default order, widths kept within bounds.
 */
export function normalizePrefs(raw: unknown, columns: string[], bounds: Record<string, { min: number; max: number }> = {}): TablePrefs {
  const base = defaultPrefs(columns);
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Partial<TablePrefs>;
  const known = new Set(columns);
  const saved = Array.isArray(p.order) ? p.order.filter((c, i, a): c is string => typeof c === "string" && known.has(c) && a.indexOf(c) === i) : [];
  const order = [...saved];
  columns.forEach((c, i) => {
    if (order.includes(c)) return;
    // After the nearest earlier default column already placed; else at the front.
    const prev = columns.slice(0, i).reverse().find((x) => order.includes(x));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, c);
  });
  const visibility: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(p.visibility ?? {})) if (known.has(k) && typeof v === "boolean") visibility[k] = v;
  const sizing: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.sizing ?? {})) {
    if (!known.has(k) || typeof v !== "number" || !Number.isFinite(v)) continue;
    const b = bounds[k];
    sizing[k] = b ? Math.min(b.max, Math.max(b.min, Math.round(v))) : Math.round(v);
  }
  return { visibility, order, sizing, density: p.density === "compact" ? "compact" : "comfortable" };
}

export function loadPrefs(key: string, columns: string[], bounds?: Record<string, { min: number; max: number }>): TablePrefs {
  try {
    const s = window.localStorage.getItem(key);
    return normalizePrefs(s ? JSON.parse(s) : null, columns, bounds);
  } catch {
    return defaultPrefs(columns);
  }
}

export function savePrefs(key: string, prefs: TablePrefs) {
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the layout just isn't remembered.
  }
}
