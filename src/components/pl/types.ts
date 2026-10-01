import type { RateCard } from "@/lib/fees/rateCard";
import type { PlAsin } from "@/lib/pl/fill";
import type { Fields, Settings, Status, Waiver } from "@/lib/pl/gatekeeper";
import type { PoeTerm } from "@/lib/pl/poe";

export type FieldSource = "keepa" | "poe" | "manual" | "fees";
export interface PlField { value: string; source: FieldSource; updated_at?: string }
export type FieldMap = Record<string, PlField>;

export interface CandidateRow {
  id: string; name: string; niche_keyword: string | null; category: string; status: string; notes: string | null;
  token_cost: number; refreshed_at: string | null; created_at: string; updated_at: string; fields: FieldMap; waivers: Waiver[];
}

export interface CandidateDetail {
  candidate: Omit<CandidateRow, "fields" | "waivers">;
  waivers: Waiver[];
  fields: FieldMap;
  asins: PlAsin[];
  poe: { id: string; niche_title: string | null; captured_at: string; search_terms: PoeTerm[]; search_volume_360: number | null } | null;
  why: Record<string, string>;
}

export interface ListResponse { candidates: CandidateRow[]; settings: Settings; card: RateCard }

export const STATUSES = ["draft", "researching", "samples", "dropped", "launched"] as const;

export const valuesOf = (m: FieldMap): Fields => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.value]));

export const TONE: Record<Status, { text: string; soft: string; solid: string; border: string }> = {
  pass: { text: "text-pass", soft: "bg-pass-soft", solid: "bg-pass text-white", border: "border-pass" },
  warn: { text: "text-warn", soft: "bg-warn-soft", solid: "bg-warn text-white", border: "border-warn" },
  fail: { text: "text-fail", soft: "bg-fail-soft", solid: "bg-fail text-white", border: "border-fail" },
  empty: { text: "text-empty", soft: "bg-empty-soft", solid: "bg-surface-2 text-ink-2", border: "border-border" },
};
