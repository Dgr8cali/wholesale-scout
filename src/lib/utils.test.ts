import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a text colour beside the app's text-meta size (a small primary button keeps its white text)", () => {
    expect(cn("bg-primary text-primary-foreground", "h-8 text-meta")).toBe("bg-primary text-primary-foreground h-8 text-meta");
    expect(cn("text-sm", "text-meta")).toBe("text-meta");
    expect(cn("text-link", "text-danger")).toBe("text-danger");
  });
});
