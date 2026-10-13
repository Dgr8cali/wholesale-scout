import { describe, expect, it } from "vitest";
import { BACKEND_BYTES, bytes, cleanBackend, clip, complianceFlags, copyAll, flatFileRow, keywordCoverage, leadTerm, normaliseDraft, ruleIssues, themeIn, type ListingDraft } from "./listing";

const draft = (o: Partial<ListingDraft> = {}): ListingDraft => ({
  title: "Lens Cleaning Wipes, 200 Individually Wrapped Pre-moistened Wipes for Glasses and Screens",
  bullets: [
    "Streak-free finish: dries fast and leaves no streaks on glasses or phone screens.",
    "Never dries out: each wipe is sealed in its own sachet, so the last is as wet as the first.",
    "Gentle on coatings: safe for anti-reflective and blue-light lenses.",
    "Pocket size: slim sachets for a bag, a car or a desk drawer.",
    "Big box: 200 wipes, enough for months of daily cleaning.",
  ],
  description: "Wipes for glasses, cameras and screens.",
  backend: "spectacle cleaner eyeglass tissue",
  differentiation: "Reviews complain wipes dry out and streak; ours are sealed singly and dry streak-free.",
  ...o,
});

describe("Listing Writer rules", () => {
  it("a clean draft has no errors", () => {
    expect(ruleIssues(draft(), { titleLimit: 200, leadTerm: "lens cleaning wipes", themes: ["dries out", "streaks", "too small"] }).filter((i) => i.level === "error").map((i) => i.message)).toEqual([]);
  });

  it("title: over the limit, not leading with the top term, ALL CAPS and promo words", () => {
    const issues = ruleIssues(draft({ title: "BEST Glasses Wipes FREE Gift — Lens Cleaning Wipes " + "x".repeat(200) }), { titleLimit: 200, leadTerm: "lens cleaning wipes" });
    const msgs = issues.filter((i) => i.field === "title").map((i) => i.message).join(" | ");
    expect(msgs).toMatch(/over 200/);
    expect(msgs).toMatch(/Doesn't lead with "lens cleaning wipes"/);
    expect(msgs).toMatch(/ALL CAPS: BEST/);
    expect(msgs).toMatch(/Promotional words: best, free/);
  });

  it("bullets: five, each opening with a capitalised benefit, three answering a Gate 4 theme", () => {
    const bad = ruleIssues(draft({ bullets: ["just some text", "b", "c", "d"] }), { titleLimit: 200, themes: ["dries out", "lid breaks", "smell"] });
    expect(bad.map((i) => i.message)).toEqual(expect.arrayContaining(["4 bullets: five needed", "Doesn't open with a short capitalised benefit (\"Leak-proof lid: …\")"]));
    expect(bad.some((i) => /of 5 bullets answer a Gate 4 complaint theme/.test(i.message))).toBe(true);
    expect(themeIn("Never dries out: sealed singly", "dries out")).toBe(true);
    expect(themeIn("Pocket size", "lid breaks")).toBe(false);
  });

  it("backend: lowercase, no title words, no brands or ASINs, each word once, ≤ 249 bytes cut at a word", () => {
    const r = cleanBackend("Spectacle Zeiss lens CLEANER spectacle B0ABCDEFGH eyeglass Care Touch tissue", "Lens Cleaning Wipes", ["Zeiss", "Care Touch"]);
    expect(r.text).toBe("spectacle cleaner eyeglass tissue");
    expect(r.dropped).toEqual(expect.arrayContaining(["zeiss", "care touch", "b0abcdefgh"]));
    const long = cleanBackend(Array.from({ length: 80 }, (_, i) => `word${i}`).join(" "), "", []);
    expect(bytes(long.text)).toBeLessThanOrEqual(BACKEND_BYTES);
    expect(long.text.endsWith(" ")).toBe(false);
  });

  it("compliance: biocidal, medical and green claims, competitor brands; green claims pass when certified", () => {
    const d = draft({ bullets: ["Antibacterial: kills 99.9% of germs.", "Medical grade, FDA approved.", "Eco-friendly and biodegradable.", "Better than Zeiss wipes.", "Sterile sachets."] });
    const terms = complianceFlags(d, { brands: ["Zeiss"] }).map((f) => f.term);
    expect(terms).toEqual(expect.arrayContaining(["antibacterial", "kills 99.9%", "medical grade", "FDA", "eco-friendly", "biodegradable", "Zeiss", "sterile"]));
    const certified = complianceFlags(d, { brands: [], notes: "FSC certified, biodegradable certification held" }).map((f) => f.term);
    expect(certified).not.toContain("biodegradable");
    expect(certified).toContain("antibacterial");
    expect(complianceFlags(draft(), { brands: ["Zeiss"] })).toEqual([]);
  });

  it("keyword coverage weighted by volume; the lead term; the flat file row; copy all", () => {
    const terms = [{ term: "lens cleaning wipes", volume: 9000 }, { term: "glasses wipes", volume: 6000 }, { term: "eyeglass cleaner", volume: 1000 }, { term: "camera cloth", volume: 500 }];
    const c = keywordCoverage(draft(), terms);
    expect(c.rows.map((r) => [r.term, r.inTitle, r.inBullets, r.inBackend])).toEqual([
      ["lens cleaning wipes", true, false, true], ["glasses wipes", false, false, true], ["eyeglass cleaner", false, false, true], ["camera cloth", false, false, false],
    ]);
    expect(c.pct).toBeCloseTo((16000 / 16500) * 100, 1);
    expect(leadTerm(terms, "lens wipes")).toBe("lens cleaning wipes");
    const ff = flatFileRow(draft({ description: "Two\nlines" }));
    expect(ff.split("\n")[0]).toBe("item_name\tbullet_point1\tbullet_point2\tbullet_point3\tbullet_point4\tbullet_point5\tproduct_description\tgeneric_keywords");
    expect(ff.split("\n")[1].split("\t")).toHaveLength(8);
    expect(ff).toContain("Two lines");
    expect(copyAll(draft())).toMatch(/^Title:\nLens Cleaning Wipes/);
  });

  it("normalises a model's draft: five bullets, the backend cleaned against the title", () => {
    const n = normaliseDraft({ title: "Lens Wipes", bullets: ["A: b"], backend: "lens Zeiss tissue" }, ["Zeiss"]);
    expect(n.bullets).toHaveLength(5);
    expect(n.backend).toBe("tissue");
  });
});

describe("the answer's caps", () => {
  it("backend terms as a word list: the first 40 single words, joined, deduped, cleaned and trimmed to 249 bytes", () => {
    const list = ["spectacle", "spectacle", "eyeglass cleaner tissue", "B0ABCDEFGH", "Zeiss", ...Array.from({ length: 60 }, (_, i) => `w${i}`)];
    const d = normaliseDraft({ title: "Dewlens Glasses Wipes", bullets: [], backend: list }, ["zeiss"]);
    const w = d.backend.split(" ");
    expect(w.slice(0, 2)).toEqual(["spectacle", "eyeglass"]);
    expect(w).not.toContain("cleaner");
    expect(w).not.toContain("zeiss");
    expect(w).not.toContain("b0abcdefgh");
    // Five words, then w0…w34: forty in all; w35 on is past the cap.
    expect(w.includes("w34")).toBe(true);
    expect(w.includes("w35")).toBe(false);
    // The byte budget still applies within the forty.
    expect(bytes(normaliseDraft({ title: "X", backend: Array.from({ length: 40 }, (_, i) => `longerword${i}`) }, []).backend)).toBeLessThanOrEqual(249);
    expect(bytes(d.backend)).toBeLessThanOrEqual(249);
    // An older answer or an edit: a string still works.
    expect(normaliseDraft({ title: "X", backend: "lens tissue" }, []).backend).toBe("lens tissue");
  });
  it("title, bullets, description and differentiation within their caps, cut at a sentence or a word", () => {
    const long = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const d = normaliseDraft({ title: `Dewlens ${"Glasses Wipes ".repeat(30)}`, bullets: [long(30), "SHORT ONE: fine."], description: long(80), differentiation: long(30) }, []);
    expect(d.title.length).toBeLessThanOrEqual(200);
    expect(d.title.endsWith(" ")).toBe(false);
    expect(d.bullets[0].length).toBeLessThanOrEqual(250);
    expect(d.bullets[0].endsWith(".")).toBe(true);
    expect(d.bullets[1]).toBe("SHORT ONE: fine.");
    expect(d.description.length).toBeLessThanOrEqual(1000);
    expect(d.differentiation.length).toBeLessThanOrEqual(400);
    expect(normaliseDraft({ title: "A ".repeat(100) }, [], 120).title.length).toBeLessThanOrEqual(120);
    expect(clip("One two three four five", 12)).toBe("One two");
  });
});
