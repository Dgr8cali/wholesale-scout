import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Wholesale Scout mark (public/logo.svg): a teal tile that carries its own background, so it reads in both themes. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src="/logo.svg" alt="Wholesale Scout" width={size} height={size} unoptimized priority className={cn("flex-none", className)} />;
}
