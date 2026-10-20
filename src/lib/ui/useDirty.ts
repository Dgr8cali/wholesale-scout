"use client";

import { useCallback, useState } from "react";

/**
 * Whether a form differs from what's saved, for "Save disabled until something changes":
 * `settle(v)` records `v` as the saved state (after loading, and after each save).
 */
export function useDirty<T>(current: T | null | undefined): { dirty: boolean; settle: (v: T) => void } {
  const [saved, setSaved] = useState<string | null>(null);
  const settle = useCallback((v: T) => setSaved(JSON.stringify(v)), []);
  return { dirty: current != null && saved != null && JSON.stringify(current) !== saved, settle };
}
