import { SECTIONS } from "@/lib/help/catalog";
import { searchDocs } from "@/lib/help/load";
import { HelpHome } from "@/components/help/HelpHome";

export const metadata = { title: "Help · Wholesale Scout" };

export default function HelpPage() {
  return <HelpHome docs={searchDocs()} sections={SECTIONS.map((s) => s.label)} />;
}
