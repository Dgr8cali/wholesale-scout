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
