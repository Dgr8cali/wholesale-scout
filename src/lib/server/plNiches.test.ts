import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { bulkNicheStatus, importNiches, listNiches, previewNicheImport, saveBrandTerms, updateNiche } from "./plNiches";

const csv = readFileSync(join(__dirname, "../../../docs/samples/poe/diy-tools.csv"), "utf8");

describe("Niche Import (FakeDb)", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    for (const t of ["pl_niche_imports", "pl_niches", "pl_niche_settings"]) fake.tables[t] ??= [];
  });

  it("preview, import, and a re-import that keeps status, notes and shape", async () => {
    const pv = await previewNicheImport(csv, "DIY & Tools");
    expect(pv).toMatchObject({ headerLine: 3, rows: 500, niches: 496, duplicates: 4, replaces: 0 });
    expect(pv.sample).toHaveLength(5);
    expect(pv.sample[0]).toMatchObject({ customer_need: "eclipse glasses", flags: expect.arrayContaining(["SPIKE"]) });
    const r1 = await importNiches({ text: csv, category: "DIY & Tools", filename: "diy-tools.csv" });
    expect(r1).toMatchObject({ niches: 496, replaced: false });
    const { niches } = await listNiches();
    const wc = niches.find((n) => n.customer_need === "window cleaner")!;
    expect(wc).toMatchObject({ category: "DIY & Tools", extra: { aliases: ["window cleaning equipment"] }, status: "new" });
    expect(wc.score).toBeGreaterThan(80);
    await updateNiche(wc.id, { status: "shortlisted", notes: "squeegee + extension pole?" });
    fake.tables.pl_niches.find((n) => n.id === wc.id)!.shape = "open";
    const r2 = await importNiches({ text: csv, category: "diy & tools" });
    expect(r2).toMatchObject({ niches: 496, replaced: true, preserved: 496 });
    expect(fake.tables.pl_niche_imports).toHaveLength(1);
    const again = (await listNiches()).niches.find((n) => n.customer_need === "window cleaner")!;
    expect(again).toMatchObject({ status: "shortlisted", notes: "squeegee + extension pole?", shape: "open" });
  });

  it("bulk status leaves candidates alone; a new brand list re-flags", async () => {
    await importNiches({ text: csv, category: "DIY & Tools" });
    const ids = fake.tables.pl_niches.slice(0, 3).map((n) => String(n.id));
    fake.tables.pl_niches[0].status = "candidate";
    await bulkNicheStatus(ids, "dismissed");
    expect(fake.tables.pl_niches.slice(0, 3).map((n) => n.status)).toEqual(["candidate", "dismissed", "dismissed"]);
    const before = fake.tables.pl_niches.find((n) => n.customer_need === "window cleaner")!.flags;
    expect(before).toEqual([]);
    const r = await saveBrandTerms("glass cleaner");
    expect(r.terms).toEqual(["glass cleaner"]);
    expect(fake.tables.pl_niches.find((n) => n.customer_need === "window cleaner")!.flags).toEqual(["BIG_BRAND"]);
    expect(fake.tables.pl_niches.find((n) => n.customer_need === "security camera outdoor")!.flags).not.toContain("BIG_BRAND");
  });
});
