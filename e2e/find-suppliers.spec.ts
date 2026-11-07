/**
 * Find suppliers with results on the page. The route checks only see an empty page, and a real search costs
 * money, so the search is answered with sample rows.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { SupplierResult, SupplierSearch } from "../src/lib/supplierSearch/display";
import { open, readOnly } from "./helpers";

const row = (over: Partial<SupplierResult>): SupplierResult => ({
  url: "https://a.example/p", supplier: "Acme Trade", type: "wholesaler", typeEvidence: "Trade customers only", typeConfidence: "high",
  country: "GB", countryEvidence: "Unit 4, Leeds LS1", price: 14.99, currency: "GBP", priceBasis: "per_case", unitsInPrice: 20, unitPrice: 0.7495,
  priceEvidence: "£14.99", priceProduct: "Bin bags 50 litre, case of 20", moq: 5, moqUnit: "cases", vat: "ex", opened: true, ...over,
});
const search: SupplierSearch = {
  id: "11111111-1111-4111-8111-111111111111", query: "black bin bags", kind: "wholesale", status: "done", error: null,
  results: [
    row({}),
    row({ url: "https://factory.example/", supplier: "Shenzhen Bags Manufacturing Company Limited", type: "manufacturer", country: "CN", countryEvidence: "Bao'an, Shenzhen", price: null, currency: null, priceBasis: "none", unitsInPrice: null, unitPrice: null, priceProduct: null, moq: null, moqUnit: null, vat: "unknown" }),
    row({ url: "https://shop.example/", supplier: "High Street Shop", type: "retailer", typeEvidence: "Free delivery on your order" }),
    row({ url: "https://www.alibaba.com/x", supplier: "Bags factory", type: "marketplace", typeEvidence: null, country: null, countryEvidence: null, price: null, currency: null, priceBasis: null, unitsInPrice: null, unitPrice: null, priceProduct: null, moq: null, moqUnit: null, vat: null, opened: false }),
  ],
  stats: { read: 3, failed: 2, blocked: 1, notOpened: 1 }, warnings: ["2 of the web searches failed, so this list may be short."],
  cost_usd: 0.19, created_at: "2026-11-07T10:00:00Z", finished_at: "2026-11-07T10:01:30Z",
};

async function withResults(page: Page) {
  await readOnly(page);
  await page.route("**/api/supplier-searches", (r) => r.fulfill({ json: { searches: [search] } }));
  await page.route(`**/api/supplier-searches/${search.id}`, (r) => r.fulfill({ json: { search } }));
}

test("shows suppliers with their country and price, and the filters narrow them", async ({ page }) => {
  await withResults(page);
  await open(page, "/find-suppliers", "light");
  const table = page.locator("main");
  const link = table.getByRole("link", { name: /Acme Trade/ }).first();
  await expect(link).toHaveAttribute("href", "https://a.example/p");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(table.getByText("£14.99 a case of 20").first()).toBeVisible();
  await expect(table.getByText("£0.75 a unit").first()).toBeVisible();
  await expect(table.getByRole("cell", { name: /United Kingdom/ }).first()).toBeVisible();
  await expect(table.getByText("3 of 4")).toBeVisible();
  await expect(table.getByRole("link", { name: /High Street Shop/ })).toHaveCount(0);

  await table.getByRole("button", { name: /Hide retailers/ }).click();
  await expect(table.getByRole("link", { name: /High Street Shop/ }).first()).toBeVisible();
  await table.getByRole("combobox", { name: "Country" }).selectOption("China");
  await expect(table.getByText("1 of 4")).toBeVisible();
  await expect(table.getByText("On request or not shown").first()).toBeVisible();
});

test("switching to another search clears the filters", async ({ page }) => {
  const other: SupplierSearch = { ...search, id: "22222222-2222-4222-8222-222222222222", query: "foil trays", results: [row({ url: "https://b.example/", supplier: "Berlin Foil", country: "DE" })] };
  await readOnly(page);
  await page.route("**/api/supplier-searches", (r) => r.fulfill({ json: { searches: [search, other] } }));
  await page.route(`**/api/supplier-searches/${search.id}`, (r) => r.fulfill({ json: { search } }));
  await page.route(`**/api/supplier-searches/${other.id}`, (r) => r.fulfill({ json: { search: other } }));
  await open(page, "/find-suppliers", "light");
  await page.getByRole("combobox", { name: "Country" }).selectOption("China");
  await expect(page.getByText("1 of 4")).toBeVisible();
  await page.getByRole("combobox", { name: "Earlier searches" }).selectOption(other.id);
  await expect(page.getByText("1 of 1")).toBeVisible();
  await expect(page.getByRole("link", { name: /Berlin Foil/ }).first()).toBeVisible();
});

test("keeps checking after a failed check, so a running search isn't lost", async ({ page }) => {
  await readOnly(page);
  let checks = 0;
  await page.route("**/api/supplier-searches", (r) => r.fulfill({ json: { searches: [search] } }));
  await page.route(`**/api/supplier-searches/${search.id}`, (r) => (++checks === 1 ? r.fulfill({ status: 502, json: { error: "Bad gateway." } }) : r.fulfill({ json: { search } })));
  await open(page, "/find-suppliers", "light");
  await expect(page.getByRole("link", { name: /Acme Trade/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Trying again/)).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no serious accessibility problem with results, ${theme}`, async ({ page }) => {
    await withResults(page);
    await open(page, "/find-suppliers", theme);
    await expect(page.getByText("3 of 4")).toBeVisible();
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
    expect(bad, bad.join("\n")).toEqual([]);
    await page.screenshot({ path: `docs/ui-audit/find-suppliers-${theme}.png`, fullPage: true });
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("fits the screen, with results", async ({ page }) => {
    await withResults(page);
    await open(page, "/find-suppliers", "light");
    await expect(page.getByText("3 of 4")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "docs/ui-audit/find-suppliers-phone.png", fullPage: true });
  });
});
