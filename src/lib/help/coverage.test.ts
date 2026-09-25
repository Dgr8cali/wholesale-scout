import { describe, expect, it } from "vitest";
import { articleForPath, headingsOf, parseArticle, search, plainText } from "./catalog";
import { appRoutes, helpProblems } from "./coverage";
import { searchDocs } from "./load";

describe("help centre", () => {
  // The build runs this file first (prebuild): a page or gate without an article fails it.
  it("has an article for every page, every gate and the extension, and no broken /help links", () => {
    expect(helpProblems()).toEqual([]);
  });

  it("finds the page's article, the most specific route winning", () => {
    const docs = [parseArticle("pages/home", "---\ntitle: Home\nroute: /\n---\n"), parseArticle("pages/runs", "---\ntitle: Runs\nroute: /runs\n---\n")];
    expect(articleForPath(docs, "/runs/abc")?.slug).toBe("pages/runs");
    expect(articleForPath(docs, "/")?.slug).toBe("pages/home");
    expect(articleForPath(docs, "/nowhere")).toBeNull();
    expect(appRoutes()).toContain("/help");
  });

  it("searches titles, text and synonyms", () => {
    const doc = (slug: string, raw: string) => { const a = parseArticle(slug, raw); return { ...a, text: plainText(a.body), headings: headingsOf(a.body) }; };
    const docs = [
      doc("howto/apply-for-a-brand", "---\ntitle: Apply for brand approval\nsynonyms: [ungate, ungating]\n---\nOpen Seller Central's **Add a product**."),
      doc("gates/priceBand", "---\ntitle: Price band\n---\nThe [Buy Box](/help/x) must sit inside the band."),
    ];
    expect(search(docs, "ungate")[0].doc.slug).toBe("howto/apply-for-a-brand");
    expect(search(docs, "buy box band")[0].doc.slug).toBe("gates/priceBand");
    expect(search(docs, "nothing like this")).toEqual([]);
    // A glossary term: found at its heading.
    const glossary = doc("reference/glossary", "---\ntitle: Glossary\n---\n## Hurdle price\nThe sell price that clears the floors.\n## Max landed\nThe most it can cost.");
    const hit = search([...docs, glossary], "hurdle price")[0];
    expect(hit).toMatchObject({ doc: { slug: "reference/glossary" }, heading: "Hurdle price" });
  });

  it("every article's words are searchable", () => {
    expect(searchDocs().every((d) => d.title && d.text.length > 0)).toBe(true);
  });
});
