"use client";

import { FavouriteNote } from "@/components/FavouriteStar";
import { WaiveControl } from "@/components/WaiveControl";
import { GATE_LABELS, GROUP_LABELS, type GateId, type GroupId } from "@/lib/screening/config";
import { RestrictionLink } from "@/lib/ui/RestrictionLink";
import { gbp } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { lastSeenLabel } from "@/lib/screening/dormant";
import { dormantOf } from "@/lib/ui/resultRows";
import type { QogitaOffers } from "@/lib/qogita/offers";
import type { Fav, Result, Seller } from "./types";

const STATUS_ICON: Record<string, string> = { pass: "✓", warn: "!", fail: "✕", skipped: "–", off: "·" };
const STATUS_STYLE: Record<string, string> = { pass: "bg-pass", warn: "bg-warn", fail: "bg-fail", skipped: "bg-muted-foreground/40", off: "bg-border" };

/** Referral and FBA fee from each source, ex-VAT and ex-DSF, at the scoring price. */
function FeeCompare({ c, dimsSource }: { c: NonNullable<NonNullable<Result["fees"]>["compare"]>; dimsSource?: string | null }) {
  const rows: [string, { referral: number | null; fba: number | null } | null][] = [
    ["Amazon (SP-API)", c.amazon],
    ["Keepa", c.keepa],
    [`Rate card${c.rateCard.tier ? ` (${c.rateCard.tier})` : ""}`, c.rateCard],
  ];
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fees by source (ex-VAT)</p>
      <table className="num w-full text-xs">
        <thead className="text-muted-foreground"><tr><th className="text-left font-normal">Source</th><th className="text-right font-normal">Referral</th><th className="text-right font-normal">FBA</th></tr></thead>
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <td className="pr-2">{label}</td>
              <td className="text-right">{v?.referral != null ? gbp(v.referral) : <span className="text-muted-foreground">—</span>}</td>
              <td className="text-right">{v?.fba != null ? gbp(v.fba) : <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dimsSource === "keepa" && <p className="mt-1 text-xs text-muted-foreground">Size from Keepa (no catalog dimensions).</p>}
    </div>
  );
}

/** Top Buy Box sellers over 365 days, with their Keepa profiles. */
function Sellers({ sellers, flaggedText }: { sellers: Seller[]; flaggedText: string }) {
  const flagged = (s: Seller) => flaggedText.includes(`likely brand distributor: ${s.name ?? s.sellerId} `);
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Buy Box sellers (365 days)</p>
      <ul className="space-y-1 text-xs">
        {sellers.map((s) => (
          <li key={s.sellerId}>
            <a className="font-medium text-brand hover:underline" href={`https://www.amazon.co.uk/sp?seller=${s.sellerId}`} target="_blank" rel="noreferrer">{s.name ?? s.sellerId}</a>
            <span className="text-muted-foreground"> · {s.sharePct}% of Buy Box</span>
            {s.ratingPct != null && <span className="text-muted-foreground"> · {s.ratingPct}% of {s.ratingCount?.toLocaleString("en-GB")} ratings</span>}
            {s.storefrontSize != null && <span className="text-muted-foreground"> · {s.storefrontSize.toLocaleString("en-GB")} listings</span>}
            {s.brandSharePct != null && (
              <span className={flagged(s) ? "font-semibold text-warn" : "text-muted-foreground"}> · {s.brandSharePct}% this brand{flagged(s) ? " (likely distributor)" : ""}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everything about one result: gates (with waive), per-unit money, fee sources, score groups, note, sellers. */
export function Detail({ r, fav, onNote, onWaive, stacked = false }: {
  stacked?: boolean;
  r: Result;
  fav?: Fav;
  onNote: (r: Result, f: Fav | undefined, note: string) => void;
  onWaive: (r: Result, gate: GateId, action: "waive" | "unwaive", reason?: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
    <div className={cn("grid gap-4", !stacked && "lg:grid-cols-[2fr_1fr_1fr]")}>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gates</p>
        <ul className="space-y-1">
          {r.gate_outcomes.map((g) => (
            <li key={g.gate} className="flex gap-2 text-xs">
              <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-2xs font-bold text-white ${STATUS_STYLE[g.status]}`}>{STATUS_ICON[g.status]}</span>
              <span className={cn("flex-none font-medium", stacked ? "w-32" : "w-40")}>{g.label}</span>
              <span className="min-w-0 text-muted-foreground">
                {g.detail}{g.gate === "gating" && <RestrictionLink outcomes={r.gate_outcomes} asin={r.product?.asin} />}
                {r.product && (g.status === "fail" || g.tags?.includes("WAIVED")) && (
                  <WaiveControl waived={!!g.tags?.includes("WAIVED")}
                    onWaive={(reason) => onWaive(r, g.gate as GateId, "waive", reason)}
                    onUnwaive={() => onWaive(r, g.gate as GateId, "unwaive")} />
                )}
              </span>
            </li>
          ))}
          {r.failed_gate && <li className="text-xs text-muted-foreground">Stopped at {GATE_LABELS[r.failed_gate]}; later gates didn&apos;t run.</li>}
        </ul>
        {r.inputs?.lookup && r.inputs.lookup.outcome !== "matched" && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Catalog lookup: {r.inputs.lookup.outcome === "search_miss" ? "search miss (Amazon answered, no items)" : "API error"}
            </summary>
            <ul className="num mt-1 space-y-0.5">
              {r.inputs.lookup.attempts.map((a, i) => (
                <li key={i}>{a.identifiersType} {a.code}: {a.error ? <span className="text-fail">{a.error}</span> : `${a.items} item${a.items === 1 ? "" : "s"}${a.total != null ? ` of ${a.total} results` : ""}`}</li>
              ))}
            </ul>
            {r.inputs.lookup.raw && <pre className="num mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-card p-2">{r.inputs.lookup.raw}</pre>}
          </details>
        )}
      </div>
      <div>
        <SellerGap r={r} />
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per unit at {gbp(r.sell_price)}</p>
        {r.fees ? (
          <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt>Referral ({r.fees.referralPct}%, {r.fees.referralCategory})</dt><dd className="text-right">{gbp(r.fees.referral)}</dd>
            <dt>FBA ({r.fees.tier ?? "?"}, {r.fees.fbaSource})</dt><dd className="text-right">{gbp(r.fees.fba)}</dd>
            <dt>Storage</dt><dd className="text-right">{gbp(r.fees.storage)}</dd>
            <dt>Returns allowance</dt><dd className="text-right">{gbp(r.fees.returns)}</dd>
            {r.fees.outputVat ? <><dt>Output VAT</dt><dd className="text-right">{gbp(r.fees.outputVat)}</dd></> : null}
            <dt>Landed cost</dt><dd className="text-right">{gbp(r.landed_cost)}</dd>
            <dt className="font-semibold">Profit</dt><dd className="text-right font-semibold">{gbp(r.profit)}</dd>
            <dt className="col-span-2 mt-1 text-muted-foreground">
              {r.fees.source === "amazon" ? "Referral and FBA from Amazon's fee estimate" : "Fees from the rate card"}; DSF and VAT on fees included{r.fees.dimsEstimated ? "; size assumed (no dimensions)" : ""}. Price: {r.price_source}.
            </dt>
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">No sell price yet.{r.hurdle_price != null ? ` Clears the floors at ${gbp(r.hurdle_price)}.` : ""}</p>
        )}
        {r.fees?.compare && <FeeCompare c={r.fees.compare} dimsSource={r.fees.dimsSource} />}
        {r.offer && (
          <p className="mt-2 text-xs text-muted-foreground">
            Quoted {r.offer.unit_cost} {r.offer.currency}/unit → {gbp(r.offer.unit_cost_gbp)} ex-VAT · MOQ {r.offer.moq ?? "—"} · {r.offer.source_ref}
          </p>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score groups</p>
        {r.group_scores ? (
          <ul className="space-y-1">
            {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => {
              const v = r.group_scores![g];
              return (
                <li key={g} className="flex items-center gap-2 text-xs">
                  <span className="w-20">{GROUP_LABELS[g]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                    {v != null && <span className="block h-full rounded-full bg-brand" style={{ width: `${v}%` }} />}
                  </span>
                  <span className="num w-7 text-right">{v ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-xs text-muted-foreground">Not scored.</p>}
        {r.product && (
          <div className="mt-3">
            <FavouriteNote note={fav?.note ?? null} starred={!!fav} onSave={(note) => onNote(r, fav, note)} />
          </div>
        )}
        {r.inputs?.sellers && r.inputs.sellers.length > 0 && (
          <Sellers sellers={r.inputs.sellers} flaggedText={r.gate_outcomes.find((g) => g.tags?.includes("BRAND_DISTRIBUTOR"))?.detail ?? ""} />
        )}
      </div>
    </div>
    {r.inputs?.qogita && <QogitaOfferList q={r.inputs.qogita} stacked={stacked} />}
    </div>
  );
}

/** How long the listing has gone without anyone selling it, from the Keepa history. */
function SellerGap({ r }: { r: Result }) {
  const m = r.inputs?.market;
  if (!m?.hasHistory) return null;
  const now = m.currentBuyBox != null || (m.offersNow ?? 0) > 0;
  const days = m.lastOfferDaysAgo ?? (now ? 0 : null);
  const dormant = dormantOf(r);
  return (
    <dl className={cn("mb-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 rounded-md px-2.5 py-1.5 text-xs", dormant ? "bg-warn-soft" : "bg-muted/60")}>
      <dt>Days without a seller</dt>
      <dd className="num text-right font-semibold">{days == null ? (dormant ? "no offer in the history" : "—") : days === 0 ? "0 (selling now)" : days.toLocaleString("en-GB")}</dd>
      {dormant && m.lastBuyBox12m != null && (
        <><dt className="text-muted-foreground">Last Buy Box</dt><dd className="num text-right text-muted-foreground">{lastSeenLabel(m.lastBuyBox12m, m.lastBuyBoxAt)}</dd></>
      )}
    </dl>
  );
}

/** Every Qogita supplier's offer for the product, the one that fits the budget highlighted. */
function QogitaOfferList({ q, stacked }: { q: QogitaOffers; stacked: boolean }) {
  const cur = q.currency === "EUR" ? "€" : `${q.currency} `;
  const m = (n: number) => `${cur}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sorted = [...q.offers].sort((a, b) => a.basePrice - b.basePrice);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qogita offers ({q.offers.length})</p>
        <p className="text-xs text-muted-foreground">
          {q.reason}{q.excluded ? ` · ${q.excluded} left out by the ${q.movLimit != null ? `${m(q.movLimit)} MOV` : "MOV or delivery"} limit` : ""} · checked {new Date(q.fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </p>
      </div>
      {!sorted.length ? <p className="text-xs text-muted-foreground">No supplier offers within the limits.</p> : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="num w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-1.5 font-medium">Supplier</th>
                <th className="px-2 py-1.5 text-right font-medium">Price / piece</th>
                <th className="px-2 py-1.5 text-right font-medium">≈ GBP</th>
                <th className="px-2 py-1.5 text-right font-medium">MOV</th>
                {!stacked && <th className="px-2 py-1.5 text-right font-medium">Tiers</th>}
                <th className="px-2 py-1.5 text-right font-medium">Case</th>
                <th className="px-2 py-1.5 text-right font-medium">In stock</th>
                <th className="px-2 py-1.5 text-right font-medium">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => {
                const chosen = o.qid === q.chosen;
                return (
                  <tr key={o.qid} className={cn("border-b last:border-0", chosen && "bg-pass-soft")}>
                    <td className="px-2 py-1.5 font-sans">
                      <span className={cn(chosen && "font-semibold")}>{o.seller}</span>
                      {chosen && <span className="ml-1.5 rounded bg-pass px-1 py-px text-2xs font-semibold text-white">fits the budget</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">{m(o.basePrice)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{gbp(o.basePrice * q.fxRate)}</td>
                    <td className="px-2 py-1.5 text-right">{m(o.baseMov)}</td>
                    {!stacked && <td className="px-2 py-1.5 text-right text-muted-foreground" title={o.tiers.map((t) => `${m(t.price)} from ${m(t.mov)}`).join("\n")}>{o.tiers.length > 1 ? `${o.tiers.length} (to ${m(Math.min(...o.tiers.map((t) => t.price)))})` : "—"}</td>}
                    <td className="px-2 py-1.5 text-right">{o.unit}</td>
                    <td className="px-2 py-1.5 text-right">{o.inventory.toLocaleString("en-GB")}</td>
                    <td className="px-2 py-1.5 text-right">{o.deliveryWeeks != null ? `${o.deliveryWeeks} wk` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
