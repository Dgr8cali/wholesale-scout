"use client";

import { BoxesIcon, MegaphoneIcon, PackageIcon, TagIcon } from "lucide-react";
import type { ComponentType } from "react";
import { WORKSPACES, workspace, type WorkspaceId } from "@/lib/workspaces";
import { cn } from "@/lib/utils";

export const WORKSPACE_ICON: Record<WorkspaceId, ComponentType<{ className?: string }>> = {
  wholesale: PackageIcon,
  pl: TagIcon,
  ads: MegaphoneIcon,
  stock: BoxesIcon,
};

/**
 * The sidebar's workspace switcher: a segmented control (Wholesale / Private label / Ads / Stock) with what
 * the current one is for underneath. Collapsed to icons, just the four icons.
 */
export function WorkspaceSwitcher({ value, onChange }: { value: WorkspaceId; onChange: (id: WorkspaceId) => void }) {
  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label="Workspace" className="flex rounded-lg border bg-surface-2 p-0.5 group-data-[collapsible=icon]:flex-col">
        {WORKSPACES.map((w) => {
          const Icon = WORKSPACE_ICON[w.id];
          const on = w.id === value;
          return (
            <button key={w.id} type="button" role="radio" aria-checked={on} title={`${w.label}: ${w.tagline}`} onClick={() => onChange(w.id)}
              className={cn("flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors", on ? "flex-1" : "flex-none px-2",
                on ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-3.5 flex-none" />
              {/* Four don't fit side by side: the current one is named, the others are icons (named on hover and to screen readers). */}
              <span className={cn("truncate group-data-[collapsible=icon]:hidden", !on && "sr-only")}>{w.id === "pl" ? "Private label" : w.label}</span>
            </button>
          );
        })}
      </div>
      <p className="px-1 text-2xs text-muted-foreground group-data-[collapsible=icon]:hidden">{workspace(value).tagline} · <kbd className="font-sans" title="Option on a Mac">Alt</kbd>+<kbd className="font-sans">Shift</kbd>+<kbd className="font-sans">W</kbd></p>
    </div>
  );
}
