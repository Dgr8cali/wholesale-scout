import { describe, expect, it } from "vitest";
import { imageUrlOf } from "./client";

describe("imageUrlOf", () => {
  it("reads imagesCSV, else Keepa's images list", () => {
    expect(imageUrlOf({ imagesCSV: "71a.jpg,72b.jpg" })).toBe("https://m.media-amazon.com/images/I/71a.jpg");
    expect(imageUrlOf({ imagesCSV: null, images: [{ l: "61L.jpg", m: "61M.jpg" }] })).toBe("https://m.media-amazon.com/images/I/61L.jpg");
    expect(imageUrlOf({})).toBeNull();
  });
});
