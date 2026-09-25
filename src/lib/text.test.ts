import { expect, it } from "vitest";
import { decodeEntities } from "./text";
it("reads HTML entities as characters", () => {
  expect(decodeEntities("Paraflu UP Antifreeze/1&nbsp;Litre Tin")).toBe("Paraflu UP Antifreeze/1 Litre Tin");
  expect(decodeEntities("Tom &amp; Jerry &#39;s &#x2013; &quot;x&quot; &bogus;")).toBe("Tom & Jerry 's – \"x\" &bogus;");
});
