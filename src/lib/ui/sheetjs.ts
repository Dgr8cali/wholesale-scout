/** SheetJS (about 500 KB) loads on first use (a file picked, an export clicked), not with the page. */
let mod: typeof import("xlsx") | null = null;

export async function sheetjs(): Promise<typeof import("xlsx")> {
  return (mod ??= await import("xlsx"));
}
