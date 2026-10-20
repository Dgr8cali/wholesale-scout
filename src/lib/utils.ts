import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The app's own type-scale step (globals.css): without it `text-meta` reads as a colour, and a
// small button's `text-meta` would drop its `text-primary-foreground`.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["meta"] } } });

/** Join class names, letting later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
