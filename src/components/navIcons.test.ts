import { describe, expect, it } from "vitest";
import { SHARED_NAV, WORKSPACES } from "@/lib/workspaces";
import { NAV_ICON } from "./navIcons";

describe("NAV_ICON", () => {
  it("gives every page in the menu its own icon", () => {
    const hrefs = [...WORKSPACES.flatMap((w) => w.nav.map((n) => n.href)), ...SHARED_NAV.map((n) => n.href)];
    expect(hrefs.filter((h) => !NAV_ICON[h])).toEqual([]);
  });
});
