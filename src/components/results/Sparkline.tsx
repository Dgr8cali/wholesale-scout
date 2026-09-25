"use client";

import { cn } from "@/lib/utils";

/**
 * A small line chart of evenly spaced values (null = gap). `invert` draws lower values
 * higher, for sales rank, where lower is better.
 */
export function Sparkline({ values, invert = false, width = 80, height = 22, className, label }: {
  values: (number | null)[] | null | undefined;
  invert?: boolean;
  width?: number;
  height?: number;
  className?: string;
  label: string;
}) {
  const nums = (values ?? []).filter((v): v is number => v != null);
  if (!values || !nums.length) return <span className="text-muted-foreground" aria-label={`${label}: no data`}>—</span>;
  const min = Math.min(...nums), max = Math.max(...nums);
  const pad = 2;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v: number) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return pad + (invert ? t : 1 - t) * (height - 2 * pad);
  };
  // One path per unbroken run of values; gaps stay gaps.
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${i === 0 || values[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const last = [...values].reverse().find((v) => v != null)!;
  const lastI = values.lastIndexOf(last);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={cn("overflow-visible text-brand", className)}>
      <title>{label}</title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(lastI)} cy={y(last)} r={1.8} fill="currentColor" />
    </svg>
  );
}
