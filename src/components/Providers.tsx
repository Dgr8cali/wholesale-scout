"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { DialogsProvider } from "@/components/Dialogs";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Theme (system by default), tooltips, in-app dialogs and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        <DialogsProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </DialogsProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
