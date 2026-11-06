/** The web searches run for a product: UK and EU wholesale, or factories in China, each with a German route. */
import type { TestItem } from "./testSet";

export interface PlannedQuery { q: string; country: "GB" | "DE" | "CN"; lang: "en" | "de" }

const WHOLESALE: [(q: string) => string, PlannedQuery["country"], PlannedQuery["lang"]][] = [
  [(q) => `${q} wholesale UK`, "GB", "en"],
  [(q) => `${q} wholesaler trade account`, "GB", "en"],
  [(q) => `${q} distributor UK`, "GB", "en"],
  [(q) => `${q} Großhandel`, "DE", "de"],
  [(q) => `${q} B2B wholesale Europe`, "DE", "en"],
];
const MANUFACTURER: typeof WHOLESALE = [
  [(q) => `${q} manufacturer China`, "CN", "en"],
  [(q) => `${q} factory OEM`, "CN", "en"],
  [(q) => `${q} OEM supplier MOQ`, "CN", "en"],
  [(q) => `${q} private label manufacturer`, "GB", "en"],
  [(q) => `${q} Hersteller`, "DE", "de"],
];

export function buildQueries(item: TestItem): PlannedQuery[] {
  return (item.kind === "manufacturer" ? MANUFACTURER : WHOLESALE).map(([make, country, lang]) => ({ q: make(item.query), country, lang }));
}
