import { describe, expect, it } from "vitest";
import { sellerIdFrom } from "./seller";

describe("sellerIdFrom", () => {
  it.each([
    ["A30PLPOC3L6XYK", "A30PLPOC3L6XYK"],
    ["  a30plpoc3l6xyk ", "A30PLPOC3L6XYK"],
    ["https://www.amazon.co.uk/sp?ie=UTF8&seller=A30PLPOC3L6XYK&asin=B0D9YS9X7Y", "A30PLPOC3L6XYK"],
    ["https://www.amazon.co.uk/s?me=ADOP2JJPG1NUE&marketplaceID=A1F83G8C2ARO7P", "ADOP2JJPG1NUE"],
    ["https://www.amazon.co.uk/shops/ADOP2JJPG1NUE", "ADOP2JJPG1NUE"],
    ["https://www.amazon.co.uk/gp/aag/main?seller=A3P5ROKL5A1OLE", "A3P5ROKL5A1OLE"],
  ])("%s", (input, id) => expect(sellerIdFrom(input)).toBe(id));

  it.each(["B0D9YS9X7Y", "https://www.amazon.co.uk/dp/B0D9YS9X7Y", "hello", ""])("no seller: %s", (input) => {
    expect(sellerIdFrom(input)).toBeNull();
  });
});
