import { describe, expect, it } from "vitest";
import { bytes, complianceFlags, type ListingDraft } from "./listing";
import {
  answersTheme, brandFirst, bulletHeader, buildBackend, enforceRules, fitTitle, inputVocabulary, isComplaint, linkedWord, listingChecks, needsProof,
  repeatedPhrases, swapRepeatedUses, titleRepeats, unsupportedNumbers, synonymForUse,
  parseList, parseSpecs, requiredThemes, specIn, titleCase, type RuleContext,
} from "./listingRules";

const ctx: RuleContext = {
  brand: "Dewlens",
  specs: parseSpecs("Pre-moistened with 70% isopropyl alcohol; wipe size 12 × 15 cm; 200 individually wrapped sachets; quick-drying; 3-year shelf life"),
  suitableFor: parseList("glasses, sunglasses, camera lenses, binoculars, phone, tablet and laptop screens"),
  notFor: parseList("contact lenses, eyes, skin"),
  avoid: parseList("plastic-free, biodegradable, eco-friendly, antibacterial, anti-fog"),
  packSize: "200 wipes",
  titleLimit: 200, leadTerm: "glasses cleaning wipes", chosenTheme: "wipes dry", product: "glasses wipes",
  themes: [
    { theme: "wipes dry", pct: 13.3 }, { theme: "clean glasses", pct: 10.6 }, { theme: "not good", pct: 8 }, { theme: "not clean", pct: 6.2 },
    { theme: "too dry", pct: 5.3 }, { theme: "too small", pct: 4.4 }, { theme: "leaves streaks", pct: 4.4 }, { theme: "too wet", pct: 4.4 }, { theme: "smells", pct: 3 },
  ],
  brands: ["zeiss", "Koala"], searchTerms: [
    { term: "glasses cleaning wipes", volume: 12000 }, { term: "lens wipes", volume: 5000 }, { term: "spectacle wipes", volume: 3000 },
    { term: "screen cleaning wipes", volume: 2500 }, { term: "eyeglass cleaner", volume: 2000 }, { term: "zeiss lens wipes", volume: 900 },
  ],
  bankTerms: ["optician wipes", "monitor cleaner", "pre moistened lens tissues", "travel lens cloth", "spectacle cleaner sachets", "eyewear cleaning tissue", "goggles visor cleaner", "microfibre alternative", "computer monitor display", "keyboard touchscreen", "dslr filter optics", "magnifier loupe", "vr headset", "smartwatch", "car mirror", "office desk", "handbag travel", "optometrist recommended"],
};

const good: ListingDraft = {
  title: "Dewlens Glasses Cleaning Wipes, 200 Individually Wrapped Pre-Moistened Wipes for Spectacles, Sunglasses and Camera Lenses, Quick-Drying",
  bullets: [
    "STAYS MOIST UNTIL OPENED: every wipe is sealed in its own sachet, so none dry out in the box. Pre-moistened with 70% isopropyl alcohol, the first wipe from a new pack works as well as the last.",
    "CLEAR, NOT WET: fingerprints and smudges lift away and the quick-drying formula leaves coated glass clear rather than smeared, with no streaks or residue left behind on the surface.",
    "GENEROUS WIPE SIZE: at 12 × 15 cm a single wipe covers both lenses or a whole phone, so there's no small, fiddly tissue that runs out halfway and nothing scratchy against your frames.",
    "KEY SPECS: a 3-year shelf life keeps a spare box ready in the drawer, the car or a camera bag, and the 200 individually wrapped sachets slip into a pocket or a purse for trips out.",
    "SUITABLE FOR: glasses, sunglasses, camera lenses, binoculars, phone, tablet and laptop screens. Not for contact lenses, eyes or skin. Simple care for the everyday things you look through.",
  ],
  description: "Dewlens wipes are pre-moistened with 70% isopropyl alcohol and quick-drying.\n\nEach wipe size 12 × 15 cm, 200 individually wrapped sachets in the box.\n\nA 3-year shelf life keeps a pack ready in a drawer, a bag or the car.",
  backend: "",
  differentiation: "Buyers say other wipes arrive dry, leave streaks or are too small. Ours are sealed one by one, quick-drying and 12 × 15 cm.",
};

describe("Listing rules: post-processing", () => {
  it("brand first, exactly once, in Title Case, promo words out, cut at a word", () => {
    expect(brandFirst("Glasses Cleaning Wipes by DEWLENS, 200 Pack", "Dewlens")).toBe("Dewlens Glasses Cleaning Wipes, 200 Pack");
    expect(brandFirst("dewlens glasses wipes", "Dewlens")).toBe("Dewlens glasses wipes");
    expect(titleCase("dewlens glasses cleaning wipes for camera lenses and phone screens, 12 × 15 cm, ULTRA soft")).toBe("Dewlens Glasses Cleaning Wipes for Camera Lenses and Phone Screens, 12 × 15 cm, Ultra Soft");
    expect(titleCase("pre-moistened quick-drying UV wipes")).toBe("Pre-Moistened Quick-Drying UV Wipes");
    expect(fitTitle("Dewlens Glasses Wipes, 200 Individually Wrapped and", 49)).toBe("Dewlens Glasses Wipes, 200 Individually Wrapped");
    const { draft, fixes } = enforceRules({ ...good, title: "BEST glasses cleaning wipes by Dewlens, 200 individually wrapped" }, ctx);
    expect(draft.title).toBe("Dewlens Glasses Cleaning Wipes, 200 Individually Wrapped");
    expect(draft.title.startsWith("Dewlens ")).toBe(true);
    expect(draft.title).not.toMatch(/best/i);
    expect(fixes).toEqual(expect.arrayContaining([expect.stringMatching(/"best" taken out/), "Title in Title Case", "Title starts with Dewlens"]));
  });

  it("bullet headers: capitalised with a colon, only for 2–4 words", () => {
    expect(bulletHeader("Stays moist: sealed one by one.")).toBe("STAYS MOIST: sealed one by one.");
    expect(bulletHeader("Clear, not wet – dries in seconds.")).toBe("CLEAR, NOT WET: dries in seconds.");
    expect(bulletHeader("Wipes: sealed.")).toBe("Wipes: sealed.");
    expect(bulletHeader("No header here at all, just a sentence.")).toBe("No header here at all, just a sentence.");
  });

  it("backend terms: filler, health/body words, not-for words, claims, brands, ASINs and title words out; filled toward 200–249 bytes", () => {
    const d = { title: good.title, bullets: good.bullets };
    const r = buildBackend("the Wipes for EYES and skin pack of zeiss B0ABCDEFGH spectacle eyeglass medical optician anti fog tissue with a to in", d, ctx);
    const w = r.text.split(" ");
    for (const banned of ["the", "for", "and", "pack", "of", "with", "a", "to", "in", "eyes", "skin", "medical", "zeiss", "b0abcdefgh", "wipes", "glasses", "anti", "fog", "contact", "dewlens"]) expect(w).not.toContain(banned);
    // "spectacle" is in the title ("Spectacles"), so it's out too.
    expect(w).not.toContain("spectacle");
    expect(w.slice(0, 3)).toEqual(["eyeglass", "optician", "tissue"]);
    expect(r.text).toBe(r.text.toLowerCase());
    expect(bytes(r.text)).toBeLessThanOrEqual(249);
    expect(r.added.length).toBeGreaterThan(0);
    // Plurals of title words count as title words (lens/lenses too).
    expect(buildBackend("lens lenses camera", { title: "Dewlens Wipes for Camera Lenses", bullets: [] }, { ...ctx, searchTerms: [], bankTerms: [], suitableFor: [] }).text).toBe("");
    expect(buildBackend("lens wipe screen", { title: "Dewlens Lens Wipes", bullets: [] }, ctx, { fill: false }).text).toBe("screen");
    // Skin is fine when the product is suitable for it.
    expect(buildBackend("skin eyes", { title: "X", bullets: [] }, { ...ctx, suitableFor: ["skin"], searchTerms: [], bankTerms: [] }).text).toBe("skin");
  });

  it("the byte budget: never over 249, filled from the search terms and the keyword bank, and the check says when it's short", () => {
    const long = Array.from({ length: 80 }, (_, i) => `screen${i}`).join(" ");
    const r = buildBackend(long, { title: "X", bullets: [] }, ctx);
    expect(bytes(r.text)).toBeLessThanOrEqual(249);
    expect(bytes(r.text)).toBeGreaterThan(240);
    const filled = enforceRules({ ...good, backend: "spectacle" }, ctx).draft;
    expect(bytes(filled.backend)).toBeGreaterThan(30);
    const short = listingChecks({ ...good, backend: "spectacle eyeglass" }, ctx).find((c) => c.id === "backend_bytes")!;
    expect(short).toMatchObject({ pass: false, detail: "18 bytes" });
    const dirty = listingChecks({ ...good, backend: "eyeglass eyes for" }, ctx).filter((c) => !c.pass && /^backend_(words|relevance)$/.test(c.id));
    expect(dirty.map((c) => c.detail).join(" ")).toMatch(/eyes/);
  });
});

describe("Listing rules: Gate 4 themes", () => {
  it("real complaints only: not praise or vague grumbles", () => {
    expect(["wipes dry", "too dry", "too wet", "leaves streaks", "too small", "not clean", "breaks"].map((t) => isComplaint(t, "glasses wipes"))).toEqual([true, true, true, true, true, true, true]);
    expect(["not good", "not great", "clean glasses", "cleaning glasses"].map((t) => isComplaint(t, "glasses wipes"))).toEqual([false, false, false, false]);
  });
  it("the themes that must be answered: the pick, and real complaints at 4% or more", () => {
    expect(requiredThemes(ctx)).toEqual(["wipes dry", "not clean", "too dry", "too small", "leaves streaks", "too wet"]);
    expect(requiredThemes({ ...ctx, chosenTheme: "smells" })[0]).toBe("smells");
  });
  it("a bullet answers a theme by naming the problem or what fixes it", () => {
    expect(answersTheme("Sealed one by one, so none arrive dry.", "wipes dry", "glasses wipes")).toBe(true);
    expect(answersTheme("Each wipe is pre-moistened.", "too dry", "glasses wipes")).toBe(true);
    expect(answersTheme("Leaves no streaks or residue.", "leaves streaks", "glasses wipes")).toBe(true);
    expect(answersTheme("A generous 12 × 15 cm size.", "too small", "glasses wipes")).toBe(true);
    expect(answersTheme("Comes in a nice box.", "too small", "glasses wipes")).toBe(false);
  });
  it("themes-answered check: lists the complaints no bullet answers", () => {
    const all = listingChecks(good, ctx);
    expect(all.find((c) => c.id === "themes")).toMatchObject({ pass: true });
    expect(all.find((c) => c.id === "bullet1_theme")).toMatchObject({ pass: true });
    // Bullets 3 and 4 (the size bullet and the specs bullet, whose 12 × 15 cm also answers it) replaced.
    const box = "PRACTICAL BOX DESIGN: a tidy dispenser that sits on a desk, in a drawer or in the car, ready whenever you need a wipe for your glasses or phone, with room for a spare cloth too.";
    const missing = listingChecks({ ...good, bullets: good.bullets.map((b, i) => (i === 2 || i === 3 ? box : b)) }, ctx);
    expect(missing.find((c) => c.id === "themes")).toMatchObject({ pass: false, detail: "Not answered: too small" });
  });
});

describe("Listing rules: checks, claims and proof", () => {
  it("a draft that follows every rule passes every check", () => {
    const d = enforceRules(good, ctx).draft;
    const failed = listingChecks(d, ctx, complianceFlags(d, { brands: ctx.brands, avoid: ctx.avoid }).map((f) => f.term)).filter((c) => !c.pass);
    expect(failed).toEqual([]);
  });
  it("key specs found by their numbers, or most of their words", () => {
    expect(specIn("wipes measure 12 × 15 cm", "wipe size 12 × 15 cm")).toBe(true);
    expect(specIn("wipes measure 12 cm", "wipe size 12 × 15 cm")).toBe(false);
    expect(specIn("a quick-drying formula", "quick-drying")).toBe(true);
    expect(listingChecks({ ...good, description: "Three\n\nshort\n\nparagraphs." }, ctx).find((c) => c.id === "description_specs")!.pass).toBe(false);
  });
  it("claims to avoid are flagged wherever they appear, even when certified", () => {
    const f = complianceFlags({ ...good, bullets: [...good.bullets.slice(0, 4), "ANTI-FOG FINISH: plastic free wrapping."] }, { brands: [], notes: "certified compostable", avoid: ctx.avoid });
    expect(f.map((x) => x.term).sort()).toEqual(["anti-fog", "plastic-free"]);
  });
  it("performance promises are flagged for proof, not blocked", () => {
    const p = needsProof({ ...good, bullets: ["STAYS MOIST: each wipe stays moist for months. Streak-free on coated lenses.", "", "", "", ""] });
    expect(p.map((x) => x.phrase.toLowerCase())).toEqual(expect.arrayContaining(["stays moist", "streak-free"]));
    expect(p.every((x) => x.sentence.length > 0)).toBe(true);
  });
});

describe("Listing rules: no repetition, claims at spec strength, relevant backend (v4's problems)", () => {
  const v4Bullets = [
    "STAYS MOIST: Each wipe is pre-moistened with 70% isopropyl alcohol and sealed in its own sachet, so it is ready the moment you tear it open. With 200 individually wrapped sachets and a 3-year shelf life, no wipe dries out waiting.",
    "CLEAN LENSES: 70% isopropyl alcohol lifts away fingerprints and smudges, and as it is quick-drying it dries in seconds, so lenses look clear instead of smeared.",
    "JUST MOIST ENOUGH: Pre-moistened with 70% isopropyl alcohol, each wipe is damp enough to lift dirt, yet quick-drying, so it dries in seconds rather than staying wet on the lens.",
    "KEY SPECS: Pre-moistened with 70% isopropyl alcohol; wipe size 12 × 15 cm; 200 individually wrapped sachets; quick-drying; 3-year shelf life.",
    "SUITABLE FOR: Glasses, sunglasses, camera lenses, binoculars, phone, tablet and laptop screens. Not for contact lenses, eyes or skin.",
  ];
  const v4 = { ...good, bullets: v4Bullets };
  const fail = (d: ListingDraft, id: string) => listingChecks(d, ctx).find((c) => c.id === id)!;

  it("each key spec in at most 2 bullets; bullet 4 only gives specs the others haven't", () => {
    expect(fail(v4, "spec_repeats")).toMatchObject({ pass: false, detail: "\"Pre-moistened with 70% isopropyl alcohol\" in bullets 1, 2, 3, 4; \"quick-drying\" in bullets 2, 3, 4" });
    expect(fail(v4, "specs_bullet_new").detail).toMatch(/^Already in another bullet: Pre-moistened with 70% isopropyl alcohol; 200 individually wrapped sachets; quick-drying; 3-year shelf life/);
    expect(fail(good, "spec_repeats").pass).toBe(true);
    expect(fail(good, "specs_bullet_new").pass).toBe(true);
    expect(fail(good, "specs_covered").pass).toBe(true);
    expect(fail({ ...good, bullets: good.bullets.map((b, i) => (i === 3 ? "KEY SPECS: a tidy box for the desk drawer, the glovebox or a camera bag, so there is always a fresh wipe nearby when you need one for your frames or screens." : b)) }, "specs_covered").detail).toBe("Missing: 200 individually wrapped sachets; 3-year shelf life");
  });

  it("a 3-word phrase in two bullets is flagged, as written; spec and use phrases are left to their own checks", () => {
    expect(repeatedPhrases(v4Bullets, ctx)).toEqual([{ phrase: "dries in seconds", bullets: [2, 3] }]);
    expect(repeatedPhrases(good.bullets, ctx)).toEqual([]);
    expect(fail(v4, "bullet_phrases").detail).toBe("\"dries in seconds\" (bullets 2, 3)");
  });

  it("each bullet has its own job: 2 the result, 3 size and feel, 5 suitable for / not for", () => {
    expect(fail(good, "bullet_jobs").pass).toBe(true);
    const swapped = [good.bullets[0], good.bullets[4], good.bullets[2], good.bullets[3], good.bullets[1]];
    expect(fail({ ...good, bullets: swapped }, "bullet_jobs").detail).toBe("Bullet 2 should be about the result (clean, clear, no streaks); 5 should say what it's suitable for and not for");
  });

  it("the title says no word twice but the product noun, and a repeated use becomes a search-term synonym", () => {
    const t = "Dewlens Glasses Wipes, 200 Wipes Individually Wrapped, Pre-Moistened Lens Cleaning Wipes for Glasses, Sunglasses and Camera Lenses";
    expect(titleRepeats(t, ctx)).toEqual(["glasses", "wipes", "lens"]);
    expect(titleRepeats(good.title, ctx)).toEqual([]);
    expect(synonymForUse("Glasses", t, ctx)).toBe("Spectacles");
    const s = swapRepeatedUses(t, ctx);
    expect(s.title).toBe("Dewlens Glasses Wipes, 200 Wipes Individually Wrapped, Pre-Moistened Lens Cleaning Wipes for Spectacles, Sunglasses and Camera Lenses");
    expect(s.swapped).toEqual(["Glasses → Spectacles"]);
    expect(enforceRules({ ...good, title: t }, ctx).fixes).toContain("Title: Glasses → Spectacles (a search-term synonym for a repeated word)");
    // Said once: nothing to swap.
    expect(swapRepeatedUses(good.title, ctx).swapped).toEqual([]);
  });

  it("numbers and timings only from Key specs and Pack size", () => {
    expect(unsupportedNumbers(v4, ctx)).toEqual(["dries in seconds"]);
    expect(unsupportedNumbers({ ...good, differentiation: "Kills 99.9% of smudges and lasts 6 months." }, ctx)).toEqual(["Kills 99.9%", "and lasts 6", "lasts 6 months"]);
    expect(unsupportedNumbers(good, ctx)).toEqual([]);
    expect(fail(good, "numbers").pass).toBe(true);
  });

  it("backend words relate to the inputs: variants pass, unrelated objects are flagged and dropped", () => {
    // Without the test keyword bank (it has "smartwatch" and "car mirror", which would link "watch" and "mirror").
    const c = { ...ctx, bankTerms: [] };
    const v = inputVocabulary(c);
    for (const w of ["eyeglasses", "specs", "sachets", "screens", "tissues", "premoistened", "smartphone"]) expect(linkedWord(w, v), w).toBe(true);
    for (const w of ["jewellery", "television", "watch", "mirror", "telescope", "microscope"]) expect(linkedWord(w, v), w).toBe(false);
    const d = { ...good, backend: "eyeglasses specs jewellery television watch mirror telescope microscope tissues" };
    expect(listingChecks(d, c).find((x) => x.id === "backend_relevance")!.detail).toBe("No link: jewellery, television, watch, mirror, telescope, microscope");
    const cleaned = enforceRules(d, c).draft.backend.split(" ");
    expect(cleaned).toEqual(expect.arrayContaining(["eyeglasses", "specs", "tissues"]));
    for (const w of ["jewellery", "television", "watch", "mirror", "telescope", "microscope"]) expect(cleaned).not.toContain(w);
  });
});
