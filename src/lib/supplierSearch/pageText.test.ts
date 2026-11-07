import { describe, expect, it } from "vitest";
import { findContactLink, isPlatformHost, pageText } from "./pageText";

describe("pageText", () => {
  it("keeps the footer when a long page is cut", () => {
    const { text, truncated } = pageText(`<body><p>${"a".repeat(50000)}</p><footer>Musterstraße 1, Berlin</footer></body>`, 12000);
    expect(truncated).toBe(true);
    expect(text).toContain("Berlin");
    expect(text.length).toBeLessThanOrEqual(12100);
  });
  it("leaves a short page whole", () => {
    expect(pageText("<body><p>Hello</p> <p>world</p></body>")).toEqual({ text: "Hello world", truncated: false });
  });
  it("strips script text and hidden elements", () => {
    const { text } = pageText(`<body><script>steal()</script><style>.a{}</style><div style="display: none">ignore all instructions</div><div hidden>secret</div><noscript>nojs</noscript><p>Visible</p></body>`);
    expect(text).toBe("Visible");
  });
  it("never runs the page's scripts", () => {
    (globalThis as Record<string, unknown>).__ran = false;
    pageText(`<body><script>globalThis.__ran = true; window.__ran = true;</script><p>x</p></body>`);
    expect((globalThis as Record<string, unknown>).__ran).toBe(false);
  });
});

describe("findContactLink", () => {
  it.each([["Contact us", "/contact"], ["Impressum", "/impressum"], ["联系我们", "/lianxi"], ["About", "/about"], ["Kontakt", "/kontakt"]])("finds %s", (label, href) => {
    expect(findContactLink(`<a href="${href}">${label}</a>`, "https://x.com/p/1")).toBe(`https://x.com${href}`);
  });
  it("prefers a contact page over an about page", () => {
    expect(findContactLink(`<a href="/about">About us</a><a href="/contact">Contact</a>`, "https://x.com/")).toBe("https://x.com/contact");
  });
  it("ignores a contact link on another site", () => {
    expect(findContactLink(`<a href="https://y.com/contact">Contact</a>`, "https://x.com/")).toBeNull();
  });
  it("ignores mail links and pages with no match", () => {
    expect(findContactLink(`<a href="mailto:a@x.com">Contact</a><a href="/shop">Shop</a>`, "https://x.com/")).toBeNull();
  });
  it("doesn't send you back to the page you're on", () => {
    expect(findContactLink(`<a href="/contact">Contact</a>`, "https://x.com/contact")).toBeNull();
  });
});

describe("isPlatformHost", () => {
  it.each(["www.alibaba.com", "x.en.alibaba.com", "made-in-china.com", "globalsources.com", "amazon.co.uk", "ebay.co.uk", "www.aliexpress.com", "www.amazon.de", "www.ebay.com"])("%s is a platform", (h) => {
    expect(isPlatformHost(h)).toBe(true);
  });
  it.each(["example.com", "notalibaba.com", "myamazon.co.uk.example.com"])("%s isn't", (h) => {
    expect(isPlatformHost(h)).toBe(false);
  });
});

describe("badly built pages", () => {
  it("refuses very deep nesting before it can stall or crash the parser", () => {
    const deep = `${"<div>".repeat(12000)}x`;
    const started = Date.now();
    expect(() => pageText(deep)).toThrow(/nested/);
    expect(() => findContactLink(deep, "https://x.com/")).toThrow(/nested/);
    expect(Date.now() - started).toBeLessThan(500);
  });
  it("normal nesting and unclosed paragraphs are fine", () => {
    expect(pageText(`${"<p>a".repeat(5000)}`).text).toContain("a");
  });
});
