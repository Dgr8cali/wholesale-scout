"use client";

import { CircleHelpIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { articleForPath, type ArticleMeta } from "@/lib/help/catalog";
import { api } from "@/lib/ui/client";
import { useHelp } from "./HelpPanel";

let index: Promise<ArticleMeta[]> | null = null;
const loadIndex = () => (index ??= api<{ articles: ArticleMeta[] }>("/api/help").then((r) => r.articles).catch(() => { index = null; return []; }));

/** The top bar's "?": this page's article in the side panel. */
export function HelpButton() {
  const path = usePathname();
  const router = useRouter();
  const { open } = useHelp();
  const [target, setTarget] = useState<ArticleMeta | null>(null);
  useEffect(() => {
    let live = true;
    loadIndex().then((all) => { if (live) setTarget(articleForPath(all, path)); });
    return () => { live = false; };
  }, [path]);
  const label = target ? `Help: ${target.title}` : "Help";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => (target ? open(target.slug) : router.push("/help"))}>
          <CircleHelpIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
