import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { approvalRequestUrl, RestrictionLink } from "./RestrictionLink";

const apiLink = {
  resource: "https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=B0060OMXUA",
  verb: "GET", title: "Request Approval via Seller Central.", type: "text/html",
};

describe("restriction links", () => {
  it("renders 'Check on Amazon' with the ASIN for a blocked row with no API link", () => {
    const html = renderToStaticMarkup(
      <RestrictionLink asin="B0CGJLC8G9" outcomes={[{ gate: "gating", status: "fail", tags: ["BLOCKED"], links: [] }]} />,
    );
    expect(html).toContain("Check on Amazon");
    expect(html).not.toContain("Apply on Amazon");
    expect(html).toContain('href="https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=B0CGJLC8G9"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("rounded border"); // plain text link, not the button style
  });

  it("renders only 'Apply on Amazon' when Amazon returned a link", () => {
    const html = renderToStaticMarkup(
      <RestrictionLink asin="B0060OMXUA" outcomes={[{ gate: "gating", status: "warn", tags: ["APPROVAL", "BRAND"], links: [apiLink] }]} />,
    );
    expect(html).toContain("Apply on Amazon");
    expect(html).not.toContain("Check on Amazon");
    expect(html).toContain(`href="${apiLink.resource}"`);
    expect(html).toContain('target="_blank"');
  });

  it("falls back for approval-needed rows too, and renders nothing for open rows", () => {
    const approval = renderToStaticMarkup(<RestrictionLink asin="B1" outcomes={[{ gate: "gating", status: "warn", tags: ["APPROVAL"] }]} />);
    expect(approval).toContain("Check on Amazon");
    expect(renderToStaticMarkup(<RestrictionLink asin="B1" outcomes={[{ gate: "gating", status: "pass" }]} />)).toBe("");
    expect(renderToStaticMarkup(<RestrictionLink asin="B1" outcomes={[{ gate: "gating", status: "pass", tags: ["BRAND_APPROVED"] }]} />)).toBe("");
    expect(approvalRequestUrl("B0 X")).toBe("https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=B0%20X");
  });
});
