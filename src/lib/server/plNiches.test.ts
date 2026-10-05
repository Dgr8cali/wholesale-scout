import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { bulkNicheStatus, importNiches, linkPoeCaptures, mergeDuplicateNiches, nichePage, nicheStats, previewNicheImport, reflagNiches, saveBrandTerms, updateNiche } from "./plNiches";

const csv = readFileSync(join(__dirname, "../../../docs/samples/poe/diy-tools.csv"), "utf8");

describe("Niche Import (FakeDb)", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    for (const t of ["pl_niche_imports", "pl_niches", "pl_niche_settings", "pl_poe_snapshots"]) fake.tables[t] ??= [];
  });

  it("preview, import, and a re-import that keeps status, notes and shape", async () => {
    const pv = await previewNicheImport(csv, "DIY & Tools");
    expect(pv).toMatchObject({ headerLine: 3, rows: 500, niches: 496, duplicates: 4, replaces: 0 });
    expect(pv.sample).toHaveLength(5);
    expect(pv.sample[0]).toMatchObject({ customer_need: "eclipse glasses", flags: expect.arrayContaining(["SPIKE"]) });
    const r1 = await importNiches({ text: csv, category: "DIY & Tools", filename: "diy-tools.csv" });
    expect(r1).toMatchObject({ niches: 496, replaced: false });
    const niches = (await nichePage({ q: "window cleaner", pageSize: 50 })).rows;
    const wc = niches.find((n) => n.customer_need === "window cleaner")!;
    expect(wc).toMatchObject({ category: "DIY & Tools", extra: { aliases: ["window cleaning equipment"] }, status: "new" });
    expect(wc.score).toBeGreaterThan(80);
    await updateNiche(wc.id, { status: "shortlisted", notes: "squeegee + extension pole?" });
    fake.tables.pl_niches.find((n) => n.id === wc.id)!.shape = "open";
    const r2 = await importNiches({ text: csv, category: "diy & tools" });
    expect(r2).toMatchObject({ niches: 496, replaced: true, preserved: 496 });
    expect(fake.tables.pl_niche_imports).toHaveLength(1);
    const again = (await nichePage({ q: "window cleaner", status: "all" })).rows.find((n) => n.customer_need === "window cleaner")!;
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

  /**
   * Two 500-row downloads (the real file, made into two categories with no duplicates, one row in
   * the second raised to a perfect score). The cap is set to 250 rows a select here, so anything
   * that reads more than a page without paging fails, as it would at Supabase's 1,000.
   */
  it("pages past the max-rows cap: 1,000 niches counted, the top score across both files first", async () => {
    fake.maxRows = 250;
    const lines = csv.replace(/\r/g, "").split("\n");
    const head = lines.slice(0, 3).join("\n");
    const data = lines.slice(3).filter((l) => l.trim());
    const file = (tag: string, bump: number, boost: number | null) => [head, ...data.map((l, i) => {
      const f = l.slice(1, -1).split('","');
      f[0] = tag ? `${f[0]} ${tag}` : f[0];
      f[4] = String(Number(f[4]) + bump + i); // unique search volume: no row merges as a duplicate
      if (i === boost) { f[4] = "3000000"; f[5] = "0.2"; f[12] = "80"; f[13] = "24.99"; f[10] = "2500"; f[11] = "3000"; }
      return `"${f.join('","')}"`;
    })].join("\n");
    expect((await importNiches({ text: file("", 0, null), category: "DIY & Tools" })).niches).toBe(500);
    expect((await importNiches({ text: file("(garden)", 100000, 321), category: "Garden" })).niches).toBe(500);
    expect(fake.tables.pl_niches).toHaveLength(1000);

    const p1 = await nichePage({ status: "all", pageSize: 100 });
    expect(p1.total).toBe(1000);
    expect(p1.rows).toHaveLength(100);
    const top = p1.rows[0];
    expect(top).toMatchObject({ score: 100, category: "Garden" });
    expect(top.customer_need).toMatch(/\(garden\)$/);
    expect(p1.rows.every((r, i) => i === 0 || (r.score ?? 0) <= (p1.rows[i - 1].score ?? 0))).toBe(true);
    // The last page holds rows 901–1,000; past it, nothing.
    expect((await nichePage({ status: "all", pageSize: 100, page: 10 })).rows).toHaveLength(100);
    expect((await nichePage({ status: "all", pageSize: 100, page: 11 })).rows).toHaveLength(0);
    // Filters and the strip count every row, not a fetched page.
    const s = await nicheStats({ hideFlags: ["SPIKE", "BIG_BRAND", "ELECTRICAL", "HEAVY_BULKY", "REGULATED"] });
    expect(s.total).toBe(1000);
    expect(s.hiddenByFlags).toBeGreaterThan(400);
    const shown = await nichePage({ status: "all", hideFlags: ["SPIKE", "BIG_BRAND", "ELECTRICAL", "HEAVY_BULKY", "REGULATED"] });
    expect(shown.total).toBe(1000 - s.hiddenByFlags);
    expect((await nicheStats({ category: "Garden" })).total).toBe(500);
    expect((await nichePage({ category: "Garden", minScore: 60, status: "all" })).total).toBe((await nicheStats({ category: "Garden" })).scoring60);
    // Re-flagging reads every niche, past the cap.
    await saveBrandTerms("window cleaner");
    expect(fake.tables.pl_niches.filter((n) => (n.flags as string[]).includes("BIG_BRAND") && String(n.customer_need).startsWith("window cleaner"))).toHaveLength(2);
    expect(await reflagNiches()).toBe(0);
  });

  it("the same niche in two categories' downloads is one row with both categories; status merges; re-imports keep it", async () => {
    await importNiches({ text: csv, category: "DIY & Tools" });
    const wc = fake.tables.pl_niches.find((n) => n.customer_need === "window cleaner")!;
    await updateNiche(String(wc.id), { status: "shortlisted", notes: "squeegee" });
    // The same download under Garden: every niche is already there.
    const g = await importNiches({ text: csv, category: "Garden" });
    expect(g.mergedAcrossCategories).toBe(496);
    expect(fake.tables.pl_niches).toHaveLength(496);
    const one = fake.tables.pl_niches.find((n) => n.customer_need === "window cleaner")!;
    expect(one).toMatchObject({ id: wc.id, status: "shortlisted", notes: "squeegee" });
    expect((one.categories as string[]).sort()).toEqual(["DIY & Tools", "Garden"]);
    expect((await nichePage({ category: "Garden", status: "all" })).total).toBe(496);
    expect((await nicheStats({ category: "DIY & Tools" })).shortlisted).toBe(1);
    // DIY & Tools again without window cleaner: it stays, under Garden only, on Garden's import.
    const lines = csv.replace(/\r/g, "").split("\n").filter((l) => !l.startsWith('"window cleaner"') && !l.startsWith('"window cleaning equipment"'));
    await importNiches({ text: lines.join("\n"), category: "DIY & Tools" });
    const after = fake.tables.pl_niches.find((n) => n.customer_need === "window cleaner")!;
    expect(after).toMatchObject({ id: wc.id, status: "shortlisted", categories: ["Garden"] });
    expect(fake.tables.pl_niche_imports.find((i) => i.id === after.import_id)!.category).toBe("Garden");
    expect(fake.tables.pl_niches).toHaveLength(496);
    // Nothing left to merge.
    expect(await mergeDuplicateNiches()).toEqual({ groups: 0, merged: 0 });
  });
  it("a capture from Opportunity Explorer gives the niche (by name or alias) its best term conversion and signal", async () => {
    await importNiches({ text: csv, category: "DIY & Tools" });
    const terms = (c: number[]) => c.map((conversion, i) => ({ term: `t${i}`, volume: 1000, click_share: null, conversion }));
    fake.tables.pl_poe_snapshots.push(
      { id: "s-old", niche_title: "Window Cleaner", captured_at: "2026-09-01T00:00:00Z", search_terms: terms([9]) },
      { id: "s-new", niche_title: "window cleaner", captured_at: "2026-10-01T00:00:00Z", search_terms: terms([3]) },
      // An alias of window cleaner's row, captured later: it's the one the niche keeps (the newest wins).
      { id: "s-alias", niche_title: "Window Cleaning Equipment", captured_at: "2026-10-03T00:00:00Z", search_terms: terms([1.2, 2.1]) },
      { id: "s-none", niche_title: "not a niche here", captured_at: "2026-10-02T00:00:00Z", search_terms: terms([7]) },
    );
    expect(await linkPoeCaptures()).toEqual({ linked: 1 });
    const wc = (await nichePage({ q: "window cleaner", status: "all" })).rows.find((n) => n.customer_need === "window cleaner")!;
    expect(wc).toMatchObject({ best_term_conversion: 2.1, term_signal: "BROWSE_ONLY", extra: { poe: { snapshotId: "s-alias" } } });
    // The niche's page sorts by it.
    const top = (await nichePage({ sort: "conv", dir: "desc", status: "all", pageSize: 1 })).rows[0];
    expect(top.id).toBe(wc.id);
    // One capture arriving: linked on its own, a BUYING one.
    fake.tables.pl_poe_snapshots.push({ id: "s-buy", niche_title: "window cleaner", captured_at: "2026-10-05T00:00:00Z", search_terms: terms([4.4, 0.5]) });
    await linkPoeCaptures("s-buy");
    expect(fake.tables.pl_niches.find((n) => n.id === wc.id)).toMatchObject({ best_term_conversion: 4.4, term_signal: "BUYING" });
  });
});
