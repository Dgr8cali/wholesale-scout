"use client";

/** A star that marks a product (EAN + ASIN) as a favourite. */
export function FavouriteStar({ starred, onToggle, busy = false }: { starred: boolean; onToggle: () => void; busy?: boolean }) {
  return (
    <button type="button" disabled={busy} aria-pressed={starred} aria-label={starred ? "Remove from favourites" : "Add to favourites"}
      title={starred ? "Favourite: click to remove" : "Add to favourites"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`flex-none text-base leading-none disabled:opacity-50 ${starred ? "text-warn" : "text-line hover:text-warn"}`}>
      {starred ? "★" : "☆"}
    </button>
  );
}

/** A favourite's note, saved when the field loses focus. */
export function FavouriteNote({ note, onSave }: { note: string | null; onSave: (note: string) => void }) {
  return (
    <label className="block space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
      <span className="font-semibold uppercase tracking-wide text-muted">Favourite note</span>
      <textarea className="input h-14 text-xs" maxLength={500} defaultValue={note ?? ""} placeholder="Why it's a favourite, what to check next…"
        onBlur={(e) => e.target.value !== (note ?? "") && onSave(e.target.value)} />
    </label>
  );
}
