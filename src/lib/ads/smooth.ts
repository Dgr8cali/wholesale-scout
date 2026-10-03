/**
 * Smoothed conversion: a keyword's own conversion pulled towards the product's by k clicks of prior,
 * so 3 orders from 12 clicks doesn't read as 25%. conv = (orders + k × prior) ÷ (clicks + k). The
 * prior is the product's conversion over the lookback, else the account's, else 7%. Pure.
 */

export const DEFAULT_SMOOTHING_K = 20;
export const FALLBACK_CONVERSION = 0.07;

export interface Prior { value: number; source: "product" | "account" | "default"; orders?: number; clicks?: number }

/** The prior: the product's conversion when it has k clicks or more, else the account's (same), else 7%. */
export function priorConversion(product: { clicks: number; orders: number } | null, account: { clicks: number; orders: number } | null, k = DEFAULT_SMOOTHING_K): Prior {
  if (product && product.clicks >= k && product.clicks > 0) return { value: product.orders / product.clicks, source: "product", ...product };
  if (account && account.clicks >= k && account.clicks > 0) return { value: account.orders / account.clicks, source: "account", ...account };
  return { value: FALLBACK_CONVERSION, source: "default" };
}

export function smoothedConversion(orders: number, clicks: number, prior: number, k = DEFAULT_SMOOTHING_K): number {
  return (orders + k * prior) / (clicks + k);
}

const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

/** "3 orders / 12 clicks raw 25%, smoothed 11%" (and where the prior came from). */
export function conversionTxt(orders: number, clicks: number, smoothed: number, prior: Prior): string {
  const raw = clicks ? orders / clicks : 0;
  const from = prior.source === "product" ? "the product's" : prior.source === "account" ? "the account's" : "the default";
  return `${orders} order${orders === 1 ? "" : "s"} / ${clicks} click${clicks === 1 ? "" : "s"} raw ${pct(raw)}, smoothed ${pct(smoothed)} (towards ${from} ${pct(prior.value)})`;
}
