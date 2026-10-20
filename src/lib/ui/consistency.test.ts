/**
 * The design system holds: every colour from the tokens in globals.css, every font size on the type
 * scale, and every button one of the shared ones in src/components/ui (Button, TextButton,
 * ChipToggle, ChipRemove, ListButton, StepButton, SortButton, ToggleGroup…). Scans the source.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}
// The web manifest needs real hex colours (theme and background).
const SOURCES = files(ROOT).filter((p) => !p.endsWith("app/manifest.ts")).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));

function hits(re: RegExp, only?: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const { path, text } of SOURCES) {
    if (only && !only(path)) continue;
    text.split("\n").forEach((line, i) => { if (re.test(line)) out.push(`${path}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  return out;
}

describe("design consistency", () => {
  it("no hard-coded colours: tokens only", () => {
    expect(hits(/["'`][^"'`]*#[0-9a-fA-F]{6}\b/)).toEqual([]);
    expect(hits(/\b(bg|text|border|fill|stroke)-(white|black)\b/)).toEqual([]);
    expect(hits(/\b(text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret)-(red|green|blue|yellow|amber|orange|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|lime|gray|slate|zinc|neutral|stone)-\d{2,3}\b/)).toEqual([]);
    expect(hits(/\[(#|rgb|hsl|oklch)\(?[0-9a-f]/i)).toEqual([]);
    expect(hits(/\b(rgba?|hsla?|oklch)\(\d/)).toEqual([]);
  });

  it("font sizes on the scale (12 / 13 / 14 / 15 / 18 / 22 / 28)", () => {
    expect(hits(/text-\[\d+(\.\d+)?(px|rem|em)\]|\btext-([3-9]xl)\b|fontSize[=:]\s*\{?["']?(?!(12|13|14|15|18|22|28)\b)\d+/)).toEqual([]);
  });

  it("no one-off <button>: buttons come from src/components/ui", () => {
    expect(hits(/<button\b/, (p) => p.endsWith(".tsx") && !p.startsWith("components/ui/"))).toEqual([]);
  });
});
