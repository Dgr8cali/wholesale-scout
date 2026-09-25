"use client";

import { useMemo, useState } from "react";
import type { SeriesPoint } from "@/lib/sparkline";

export interface ChartSeries {
  label: string;
  points: SeriesPoint[];
  /** A CSS colour (a token: var(--accent-strong)). */
  colour: string;
  dashed?: boolean;
}

const DAY = 86_400_000;

/** Step values (Keepa's form: a value holds until the next point), trimmed to the window. */
function steps(points: SeriesPoint[], from: number, to: number): { t: number; v: number | null }[] {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const out: { t: number; v: number | null }[] = [];
  let before: number | null = null;
  for (const [t, v] of pts) {
    const val = v != null && Number.isFinite(v) && v >= 0 ? v : null;
    if (t < from) { before = val; continue; }
    if (t > to) break;
    if (!out.length) out.push({ t: from, v: before });
    out.push({ t, v: val });
  }
  if (!out.length) out.push({ t: from, v: before });
  out.push({ t: to, v: out[out.length - 1].v });
  return out;
}

/**
 * A 12-month step chart of one or more series on one scale (price, or rank on a log scale,
 * lower = better drawn higher). Hover shows each series' value on that day.
 */
export function HistoryChart({ series, format, now, log = false, invert = false, days = 365, height = 150 }: {
  series: ChartSeries[]; format: (v: number) => string;
  /** The chart's right edge: when the data was fetched. */
  now: number;
  log?: boolean; invert?: boolean; days?: number; height?: number;
}) {
  const W = 640, H = height, padL = 52, padR = 8, padT = 8, padB = 18;
  const from = now - days * DAY;
  const data = useMemo(() => series.map((s) => ({ ...s, st: steps(s.points, from, now) })), [series, from, now]);
  const values = data.flatMap((s) => s.st.map((p) => p.v)).filter((v): v is number => v != null && (!log || v > 0));
  const [hover, setHover] = useState<number | null>(null);
  if (!values.length) return <p className="py-6 text-center text-xs text-muted-foreground">No history in the last {Math.round(days / 30)} months.</p>;
  const f = (v: number) => (log ? Math.log10(v) : v);
  let lo = Math.min(...values.map(f)), hi = Math.max(...values.map(f));
  if (hi === lo) { hi += log ? 0.1 : Math.max(1, hi * 0.05); lo -= log ? 0.1 : Math.max(1, lo * 0.05); }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const x = (t: number) => padL + ((t - from) / (now - from)) * (W - padL - padR);
  const y = (v: number) => { const r = (f(v) - lo) / (hi - lo); return padT + (invert ? r : 1 - r) * (H - padT - padB); };
  const path = (st: { t: number; v: number | null }[]) => {
    let d = "", on = false;
    for (let i = 0; i < st.length; i++) {
      const p = st[i], next = st[i + 1];
      if (p.v == null || (log && p.v <= 0)) { on = false; continue; }
      const x1 = x(p.t), x2 = x(next ? next.t : p.t), yy = y(p.v);
      d += `${on ? "L" : "M"}${x1.toFixed(1)},${yy.toFixed(1)}H${x2.toFixed(1)}`;
      on = true;
    }
    return d;
  };
  const ticks = [0, 0.5, 1].map((r) => { const fv = lo + r * (hi - lo); const v = log ? 10 ** fv : fv; return { v, yy: y(v) }; });
  const months = Array.from({ length: 4 }, (_, i) => from + ((i + 1) / 4) * (now - from));
  const at = (st: { t: number; v: number | null }[], t: number) => { let v: number | null = null; for (const p of st) { if (p.t > t) break; v = p.v; } return v; };
  const tHover = hover == null ? null : from + ((hover - padL) / (W - padL - padR)) * (now - from);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.label).join(", ")}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(px >= padL && px <= W - padR ? px : null); }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={t.yy} y2={t.yy} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 6} y={t.yy + 3} textAnchor="end" className="num" fontSize="10" fill="var(--muted-ink)">{format(t.v)}</text>
          </g>
        ))}
        {months.map((t, i) => (
          <text key={i} x={x(t)} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--muted-ink)">
            {new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
          </text>
        ))}
        {data.map((s) => <path key={s.label} d={path(s.st)} fill="none" stroke={s.colour} strokeWidth="1.6" strokeDasharray={s.dashed ? "4 3" : undefined} />)}
        {hover != null && <line x1={hover} x2={hover} y1={padT} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {data.map((s) => {
          const v = tHover != null ? at(s.st, tHover) : null;
          return (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: s.colour }} />
              {s.label}{tHover != null && <b className="num font-medium text-foreground">{v != null ? format(v) : "—"}</b>}
            </span>
          );
        })}
        {tHover != null && <span className="num ml-auto">{new Date(tHover).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
      </div>
    </div>
  );
}
