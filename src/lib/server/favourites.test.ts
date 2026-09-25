import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { addFavourite, bulkFavourites } from "./favourites";

const EAN = "3337875597197";

describe("favourites: the note and the star can't race", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
  });

  it("note then star, at the same moment (the note's save is still in flight)", async () => {
    const [a, b] = await Promise.all([addFavourite(EAN, "B0NOTE0001", "check the MOQ"), addFavourite(EAN, "B0NOTE0001")]);
    expect(a.id).toBe(b.id);
    expect(fake.tables.favourites).toHaveLength(1);
    expect(fake.tables.favourites[0].note).toBe("check the MOQ");
  });

  it("star then note, at the same moment", async () => {
    const [a, b] = await Promise.all([addFavourite(EAN, null), addFavourite(EAN, null, "no ASIN yet")]);
    expect(a.id).toBe(b.id);
    expect(fake.tables.favourites).toHaveLength(1);
    expect(fake.tables.favourites[0].note).toBe("no ASIN yet");
  });

  it("starring again keeps the note; a new note replaces it; bulk star is idempotent", async () => {
    await addFavourite(EAN, "B0NOTE0001", "first");
    expect((await addFavourite(EAN, "B0NOTE0001")).note).toBe("first");
    expect((await addFavourite(EAN, "B0NOTE0001", "second")).note).toBe("second");
    await Promise.all([bulkFavourites([{ ean: EAN, asin: "B0NOTE0001" }], "star"), addFavourite(EAN, "B0NOTE0001", "third")]);
    expect(fake.tables.favourites).toHaveLength(1);
    expect(fake.tables.favourites[0].note).toBe("third");
  });
});
