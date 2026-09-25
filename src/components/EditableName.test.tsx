import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditableName } from "./EditableName";

describe("EditableName", () => {
  it("shows the name (or a link) with a rename control", () => {
    const html = renderToStaticMarkup(<EditableName value="Qogita fragrance, Sept" onSave={async () => {}} />);
    expect(html).toContain("Qogita fragrance, Sept");
    expect(html).toContain('aria-label="Rename"');
    const link = renderToStaticMarkup(<EditableName value="x" display={<strong>Run one</strong>} onSave={async () => {}} />);
    expect(link).toContain("<strong>Run one</strong>");
  });
});

describe("FavouriteStar", () => {
  it("is an outline star in a visible colour, filled when starred", async () => {
    const { FavouriteStar } = await import("./FavouriteStar");
    const off = renderToStaticMarkup(<FavouriteStar starred={false} onToggle={() => {}} />);
    expect(off).toContain('aria-label="Add to favourites"');
    expect(off).toContain('fill="none"');
    expect(off).toContain("text-muted"); // not the near-white border grey
    const on = renderToStaticMarkup(<FavouriteStar starred onToggle={() => {}} />);
    expect(on).toContain('fill="currentColor"');
    expect(on).toContain("text-warn");
  });
});

describe("ProductThumb", () => {
  it("sizes Amazon CDN images, links to the listing, and falls back to a placeholder", async () => {
    const { amazonImage, ProductThumb } = await import("./ProductThumb");
    expect(amazonImage("https://m.media-amazon.com/images/I/51fxO9b607L.jpg", 80)).toBe("https://m.media-amazon.com/images/I/51fxO9b607L._SL80_.jpg");
    expect(amazonImage("https://m.media-amazon.com/images/I/31Ui5w9QYfL._SL75_.jpg", 600)).toBe("https://m.media-amazon.com/images/I/31Ui5w9QYfL._SL600_.jpg");
    const html = renderToStaticMarkup(<ProductThumb url="https://m.media-amazon.com/images/I/51fxO9b607L.jpg" asin="B0060OMXUA" title="Bioderma Sebium" brand="Bioderma" />);
    expect(html).toContain('href="https://www.amazon.co.uk/dp/B0060OMXUA"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("51fxO9b607L._SL80_.jpg");
    const none = renderToStaticMarkup(<ProductThumb url={null} asin="B1" title="x" brand={null} />);
    expect(none).not.toContain("<img");
    expect(none).toContain("<svg");
  });
});
