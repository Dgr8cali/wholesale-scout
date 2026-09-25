"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * An Amazon CDN image at a given size: Amazon serves any image file at `<name>._SL<px>_.<ext>`.
 * Used at twice the display size for sharp screens.
 */
export function amazonImage(url: string, px: number): string {
  return url.replace(/(\._[A-Z0-9,_]+_)?\.(jpe?g|png|gif|webp)$/i, `._SL${px}_.$2`);
}

function Placeholder({ size }: { size: number }) {
  return (
    <span className="flex items-center justify-center rounded border border-border bg-muted text-muted-foreground" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" />
        <path d="M3 7.5L12 12l9-4.5M12 12v9" />
      </svg>
    </span>
  );
}

/**
 * A product thumbnail (40px by default), loaded lazily. Hover (or focus) shows a ~300px preview with the
 * title, brand and ASIN; click opens the Amazon UK listing in a new tab. No image: a placeholder.
 */
export function ProductThumb({ url, asin, title, brand, size = 40 }: { url: string | null | undefined; asin: string | null | undefined; title: string | null; brand: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const hasImage = !!url && !failed;

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = 316, h = 400;
    // Beside the thumbnail, kept on screen.
    const x = r.right + 12 + w > window.innerWidth ? Math.max(8, r.left - w - 12) : r.right + 12;
    const y = Math.min(Math.max(8, r.top - 40), window.innerHeight - h - 8);
    setPreview({ x, y });
  };

  const thumb = hasImage ? (
    // Plain <img>: Amazon's CDN serves the sizes; no need to route thumbnails through image optimisation.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={amazonImage(url!, size * 2)} alt="" width={size} height={size} loading="lazy" decoding="async"
      onError={() => setFailed(true)} className="rounded border border-border bg-white object-contain" style={{ width: size, height: size }} />
  ) : <Placeholder size={size} />;

  const card = preview && typeof document !== "undefined" && createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-50 w-[316px] rounded-lg border border-border bg-card p-2 shadow-xl" style={{ left: preview.x, top: preview.y }}>
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={amazonImage(url!, 600)} alt="" width={300} height={300} className="h-[300px] w-[300px] rounded bg-white object-contain" />
      ) : <Placeholder size={300} />}
      <p className="mt-2 line-clamp-3 text-sm font-medium leading-snug">{title ?? "Untitled"}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{[brand, asin].filter(Boolean).join(" · ") || "No ASIN"}</p>
    </div>,
    document.body,
  );

  const common = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget),
    onMouseLeave: () => setPreview(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget),
    onBlur: () => setPreview(null),
    className: "block flex-none",
    style: { width: size, height: size },
  };
  return (
    <>
      {asin ? (
        <a href={`https://www.amazon.co.uk/dp/${asin}`} target="_blank" rel="noreferrer noopener" aria-label={`Open ${title ?? asin} on Amazon UK`}
          onClick={(e) => e.stopPropagation()} {...common}>
          {thumb}
        </a>
      ) : (
        <span tabIndex={0} aria-label={title ?? "No image"} {...common}>{thumb}</span>
      )}
      {card}
    </>
  );
}
