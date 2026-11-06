import { describe, expect, it } from "vitest";
import { robotsAllows } from "./robots";

const AGENT = "WholesaleScoutSpike";

describe("robotsAllows", () => {
  it("a disallowed path is refused, and no robots file allows", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /p/", "/p/1", AGENT)).toBe(false);
    expect(robotsAllows(null, "/p/1", AGENT)).toBe(true);
  });
  it("other paths stay allowed", () => expect(robotsAllows("User-agent: *\nDisallow: /p/", "/q/1", AGENT)).toBe(true));
  it("an empty Disallow allows everything", () => expect(robotsAllows("User-agent: *\nDisallow:", "/p/1", AGENT)).toBe(true));
  it("rules for this agent replace the * rules", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: WholesaleScoutSpike\nDisallow: /private/";
    expect(robotsAllows(txt, "/p/1", AGENT)).toBe(true);
    expect(robotsAllows(txt, "/private/1", AGENT)).toBe(false);
  });
  it("rules for another agent don't apply", () => expect(robotsAllows("User-agent: Googlebot\nDisallow: /", "/p/1", AGENT)).toBe(true));
  it("the longest matching rule wins, so Allow can override", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /p/\nAllow: /p/open/", "/p/open/1", AGENT)).toBe(true);
  });
  it("understands * and $", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "/a/b.pdf", AGENT)).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /*.pdf$", "/a/b.pdf.html", AGENT)).toBe(true);
  });
  it("several agent lines share one group, and comments are ignored", () => {
    expect(robotsAllows("User-agent: a\nUser-agent: *  # all\nDisallow: /x # no", "/x/1", AGENT)).toBe(false);
  });
});
