/**
 * The star and the note on a result row, kept in step. Each product's actions run one after
 * another (a star clicked while its note is still saving waits for the save), the shown state
 * changes at once, and it's put back if the server says no.
 */
import { favKey } from "./resultRows";

export interface FavItem {
  ean: string;
  asin: string | null;
}

export interface SyncedFav extends FavItem {
  /** "" until the server has answered. */
  id: string;
  note: string | null;
}

export interface FavApi {
  /** Star (keeps an existing note). */
  star(item: FavItem): Promise<SyncedFav>;
  /** Star with this note (replaces the note). */
  note(item: FavItem, note: string): Promise<SyncedFav>;
  remove(id: string): Promise<void>;
}

export interface FavStore {
  get(key: string): SyncedFav | undefined;
  set(key: string, fav: SyncedFav | undefined): void;
}

export const favKeyOf = favKey;

/** The favourites map, readable at once (React state lags a render); each change is reported. */
export function favStore<F extends SyncedFav>(onChange: (m: Map<string, F>) => void) {
  let map = new Map<string, F>();
  return {
    get: (k: string) => map.get(k),
    set: (k: string, f: F | undefined) => {
      map = new Map(map);
      if (f) map.set(k, f);
      else map.delete(k);
      onChange(map);
    },
    /** Replace the whole map (a load, or a bulk star). */
    update: (f: (m: Map<string, F>) => Map<string, F>) => {
      map = f(map);
      onChange(map);
    },
  };
}

export function favouriteSync(api: FavApi, store: FavStore, opts: {
  /** Asked before un-starring a product that has a note; false keeps it. */
  confirmUnstar?: (fav: SyncedFav) => Promise<boolean>;
  onError?: (e: Error) => void;
} = {}) {
  // Per product: the last queued action, resolving to the saved favourite (or none).
  const queue = new Map<string, Promise<SyncedFav | undefined>>();

  const run = (key: string, before: SyncedFav | undefined, op: (saved: SyncedFav | undefined) => Promise<SyncedFav | undefined>) => {
    const prev = queue.get(key) ?? Promise.resolve(before);
    const next = prev.then(op).then(
      (fav) => {
        // A later action has taken over the shown state.
        if (queue.get(key) === next) store.set(key, fav);
        return fav;
      },
      (e: Error) => {
        if (queue.get(key) === next) store.set(key, before);
        opts.onError?.(e);
        return before;
      },
    );
    queue.set(key, next);
    return next;
  };

  return {
    /** Save a note; on a product not yet starred, a non-empty note stars it. */
    saveNote(item: FavItem, note: string) {
      const key = favKeyOf(item.ean, item.asin);
      const cur = store.get(key);
      if (!cur && !note.trim()) return Promise.resolve(undefined);
      store.set(key, { id: cur?.id ?? "", ...item, note: note.trim() || null });
      return run(key, cur, () => api.note(item, note));
    },

    /** Star, or un-star (confirming first when there's a note) a starred product. */
    async toggle(item: FavItem, confirmUnstar = opts.confirmUnstar ?? (async () => true)) {
      const key = favKeyOf(item.ean, item.asin);
      const cur = store.get(key);
      if (!cur) {
        store.set(key, { id: "", ...item, note: null });
        return run(key, cur, () => api.star(item));
      }
      if (cur.note && !(await confirmUnstar(cur))) return cur;
      store.set(key, undefined);
      return run(key, cur, async (saved) => {
        if (saved?.id) await api.remove(saved.id);
        return undefined;
      });
    },
  };
}
