import { describe, expect, it, vi } from "vitest";
import { favKeyOf, favouriteSync, type FavApi, type FavItem, type SyncedFav } from "./favouriteSync";

const ITEM: FavItem = { ean: "3337875597197", asin: "B0NOTE0001" };
const KEY = favKeyOf(ITEM.ean, ITEM.asin);

/** A server that answers when told to, with one row per product (like the upsert). */
function setup(confirm = true) {
  let row: SyncedFav | undefined;
  const pending: (() => void)[] = [];
  const later = <T,>(f: () => T) => new Promise<T>((ok) => pending.push(() => ok(f())));
  const api: FavApi = {
    star: vi.fn(() => later(() => (row ??= { id: "fav-1", ...ITEM, note: null }))),
    note: vi.fn((_i: FavItem, note: string) => later(() => (row = { id: row?.id ?? "fav-1", ...ITEM, note: note.trim() || null }))),
    remove: vi.fn((id: string) => later(() => { if (row?.id === id) row = undefined; })),
  };
  const shown = new Map<string, SyncedFav | undefined>();
  const store = { get: (k: string) => shown.get(k), set: (k: string, f: SyncedFav | undefined) => void shown.set(k, f) };
  const confirmUnstar = vi.fn(async () => confirm);
  const sync = favouriteSync(api, store, { confirmUnstar });
  /** Let the server answer everything queued so far, in order. */
  const flush = async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      pending.shift()?.();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { api, sync, shown, server: () => row, confirmUnstar, flush };
}

describe("favourite star and note", () => {
  it("note then star: the star shows at once; clicking it (after confirming) un-stars once the note has saved", async () => {
    const t = setup(true);
    const saving = t.sync.saveNote(ITEM, "check the MOQ");
    expect(t.shown.get(KEY)).toMatchObject({ note: "check the MOQ" }); // starred straight away
    const clicked = t.sync.toggle(ITEM); // clicked while the note is still saving
    expect(t.confirmUnstar).toHaveBeenCalledOnce();
    await t.flush();
    await Promise.all([saving, clicked]);
    expect(t.api.star).not.toHaveBeenCalled(); // no second insert racing the note
    expect(t.api.remove).toHaveBeenCalledWith("fav-1");
    expect(t.server()).toBeUndefined();
    expect(t.shown.get(KEY)).toBeUndefined();
  });

  it("note then star, declining the confirmation, keeps the star and the note", async () => {
    const t = setup(false);
    t.sync.saveNote(ITEM, "check the MOQ");
    await t.sync.toggle(ITEM);
    await t.flush();
    expect(t.api.remove).not.toHaveBeenCalled();
    expect(t.server()).toMatchObject({ id: "fav-1", note: "check the MOQ" });
    expect(t.shown.get(KEY)).toMatchObject({ id: "fav-1", note: "check the MOQ" });
  });

  it("star then note: the note waits for the star and lands on the same favourite", async () => {
    const t = setup();
    const starred = t.sync.toggle(ITEM);
    expect(t.shown.get(KEY)).toMatchObject({ note: null });
    const noted = t.sync.saveNote(ITEM, "reorder in May");
    await t.flush();
    await Promise.all([starred, noted]);
    expect(t.api.star).toHaveBeenCalledOnce();
    expect(t.api.note).toHaveBeenCalledOnce();
    expect(t.server()).toMatchObject({ id: "fav-1", note: "reorder in May" });
    expect(t.shown.get(KEY)).toMatchObject({ id: "fav-1", note: "reorder in May" });
  });

  it("un-starring without a note asks nothing; a failed save puts the star back", async () => {
    const t = setup();
    t.sync.toggle(ITEM);
    await t.flush();
    t.sync.toggle(ITEM);
    await t.flush();
    expect(t.confirmUnstar).not.toHaveBeenCalled();
    expect(t.server()).toBeUndefined();

    const u = setup();
    (u.api.star as ReturnType<typeof vi.fn>).mockImplementationOnce(() => Promise.reject(new Error("offline")));
    await u.sync.toggle(ITEM);
    await u.flush();
    expect(u.shown.get(KEY)).toBeUndefined();
  });
});
