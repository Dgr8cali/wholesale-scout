"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { adsDefaults, withAdsDefaults } from "@/lib/pl/adsDefaults";
import { evaluate, type Evaluation, type Waiver } from "@/lib/pl/gatekeeper";
import { targetExworks } from "@/lib/pl/supplierScore";
import { api } from "@/lib/ui/client";
import { valuesOf, type CandidateDetail, type FieldMap } from "../types";

/**
 * One candidate's record for the tabs that show its gates (Overview, Gates, Reviews): loaded when the
 * tab opens, scored as you type, each field saved shortly after you stop. `onChanged` tells the page
 * header (gates passed, the next action) to look again.
 */
export function useCandidate(id: string, onChanged?: () => void) {
  const [data, setData] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldMap>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);

  const load = useCallback(() => api<CandidateDetail>(`/api/pl/candidates/${id}`).then(
    (d) => { setData(d); setFields(d.fields); setError(null); return d; },
    (e: Error) => { setError(e.message); return null; },
  ), [id]);
  useEffect(() => { void load(); }, [load]);
  /** Reload, then tell the header. */
  const reload = useCallback(async () => { const d = await load(); changed.current?.(); return d; }, [load]);

  const ev: Evaluation | null = useMemo(() => (data ? evaluate(withAdsDefaults(valuesOf(fields), data.adsCpc), data.candidate.category, data.settings, data.card, new Date(), data.waivers) : null), [data, fields]);
  const derived = useMemo(() => adsDefaults(valuesOf(fields), data?.adsCpc ?? 0), [fields, data?.adsCpc]);
  const exworksDerived = useMemo(() => {
    const t = targetExworks(valuesOf(fields));
    return t.derived && t.value != null ? { value: t.value, why: `Gate 0's landed cost £${Number(fields.landed?.value).toFixed(2)} ÷ 1.4` } : undefined;
  }, [fields]);

  /** Your own value: shown at once, saved shortly after you stop typing. */
  const saveField = useCallback((k: string, value: string, delay = 500) => {
    setFields((cur) => {
      const next = { ...cur };
      if (value === "") delete next[k];
      else next[k] = { value, source: "manual" };
      return next;
    });
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => {
      api<{ refilled?: string[] }>(`/api/pl/candidates/${id}/fields`, { method: "PUT", json: { key: k, value } })
        // A new target price band re-reads Gate 1's price spread on the server.
        .then(async (r) => { if (r.refilled?.length) await load(); changed.current?.(); })
        .catch((e) => toast.error(`Not saved: ${(e as Error).message}`));
    }, delay);
  }, [id, load]);

  /** Name, niche keyword, category, status, notes, park reason, unpark, a new ASIN list. */
  const patch = useCallback(async (p: Record<string, unknown>, msg?: string) => {
    try {
      await api(`/api/pl/candidates/${id}`, { method: "PATCH", json: p });
      if (p.status != null || p.unpark || p.park_reason !== undefined || p.asins != null) await reload();
      else { setData((d) => d && { ...d, candidate: { ...d.candidate, ...(p as object) } }); if (p.name != null) changed.current?.(); }
      if (msg) toast.success(msg);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }, [id, reload]);

  const waive = useCallback(async (gate_id: string, check_label: string | null, reason: string) => {
    const r = await api<{ waiver: Waiver }>(`/api/pl/candidates/${id}/waivers`, { method: "POST", json: { gate_id, check_label, reason } });
    setData((d) => d && { ...d, waivers: [...(d.waivers ?? []).filter((w) => w.id !== r.waiver.id), r.waiver] });
    changed.current?.();
  }, [id]);
  const unwaive = useCallback(async (w: Waiver) => {
    try {
      await api(`/api/pl/candidates/${id}/waivers?waiver=${w.id}`, { method: "DELETE" });
      setData((d) => d && { ...d, waivers: (d.waivers ?? []).filter((x) => x.id !== w.id) });
      changed.current?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  return { data, error, fields, ev, derived, exworksDerived, load, reload, saveField, patch, waive, unwaive };
}

export type CandidateState = ReturnType<typeof useCandidate>;
