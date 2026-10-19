"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

/** The top bar's theme button: light ↔ dark. System (the default) is chosen in Settings. */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  // The theme is only known in the browser; render a neutral icon on the server.
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Switch to light" : "Switch to dark";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const CHOICES = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

/** Settings' Appearance: System (follows the device, the default), Light or Dark. */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? theme ?? "system" : "system";
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex gap-1 rounded-xl border border-border bg-card p-1">
      {CHOICES.map(({ value, label, Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={current === value} onClick={() => setTheme(value)}
          className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
            current === value && "bg-primary-soft text-primary-ink hover:text-primary-ink")}>
          <Icon /> {label}
        </button>
      ))}
    </div>
  );
}
