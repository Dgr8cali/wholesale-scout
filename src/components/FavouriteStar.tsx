"use client";

/** A star that marks a product (EAN + ASIN) as a favourite: an outline always, filled when starred. */
export function FavouriteStar({ starred, onToggle, busy = false }: { starred: boolean; onToggle: () => void; busy?: boolean }) {
  return (
    <button type="button" disabled={busy} aria-pressed={starred} aria-label={starred ? "Remove from favourites" : "Add to favourites"}
      title={starred ? "Favourite: click to remove" : "Add to favourites"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`-m-1 flex-none rounded p-1 disabled:opacity-50 ${starred ? "text-warn" : "text-muted hover:text-warn"}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8z"
          fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** A favourite's note, saved when the field loses focus. On a product not yet starred, a note stars it. */
export function FavouriteNote({ note, onSave, starred = true }: { note: string | null; onSave: (note: string) => void; starred?: boolean }) {
  return (
    <label className="block space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
      <span className="font-semibold uppercase tracking-wide text-muted">Favourite note{starred ? "" : " (adding one stars the product)"}</span>
      <textarea className="input h-14 text-xs" maxLength={500} defaultValue={note ?? ""} placeholder="Why it's a favourite, what to check next…"
        onBlur={(e) => e.target.value !== (note ?? "") && onSave(e.target.value)} />
    </label>
  );
}
