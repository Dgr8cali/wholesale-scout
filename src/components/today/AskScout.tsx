"use client";

import { ArrowUpIcon, Loader2Icon, MessageCircleQuestionIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { AskRun } from "@/lib/server/askScout";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { ListButton } from "@/components/ui/list-button";
import { ListSkeleton } from "@/components/ui/skeletons";

const EXAMPLES = ["Is the seat belt making money after ads?", "When should I reorder the pill box?", "Which suppliers haven't replied?"];
/** Every open panel reloads when one of them asks something. */
const CHANGED = "ask-scout:changed";
const INLINE_INPUT = "ask-scout-inline";

const n = (x: number) => x.toLocaleString("en-GB");
const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One question and its answer: the numbers it used, links to the pages behind them, what was missing, and what it cost. */
function Answer({ r }: { r: AskRun }) {
  const a = r.answer;
  return (
    <li className="space-y-2">
      <p className="ml-6 rounded-[10px] bg-primary-soft px-3 py-2 text-sm text-primary-ink">{r.question}</p>
      <div className="space-y-2 rounded-[10px] border border-border bg-card px-3 py-2.5">
        {r.error || !a ? (
          <p className="flex items-start gap-2 text-sm text-danger"><TriangleAlertIcon className="mt-0.5 size-4 flex-none" />{r.error ?? "No answer."}</p>
        ) : (
          <>
            <p className="text-sm whitespace-pre-line">{a.answer}</p>
            {a.figures.length > 0 && (
              <dl className="divide-y divide-divider rounded-lg bg-muted/50 px-2.5 text-meta">
                {a.figures.map((f, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="min-w-0 text-muted-foreground">{f.href ? <Link href={f.href} className="hover:underline">{f.label}</Link> : f.label}</dt>
                    <dd className="num flex-none font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {a.missing.length > 0 && <p className="text-meta text-warn-ink">Missing: {a.missing.join("; ")}</p>}
            {a.links.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {a.links.map((l, i) => <Link key={i} href={l.href} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent">{l.label}</Link>)}
              </p>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {n(r.input_tokens)} in / {n(r.output_tokens)} out · £{r.cost_gbp.toFixed(3)} · {r.tools.length} lookup{r.tools.length === 1 ? "" : "s"} · {at(r.created_at)}
        </p>
      </div>
    </li>
  );
}

/**
 * Ask Scout: questions about your own data, answered from read-only lookups (the last 20 kept).
 * `autoAsk` sends a question as soon as it opens (from ⌘K).
 */
export function AskScout({ inputId, autoAsk, className }: { inputId?: string; autoAsk?: string | null; className?: string }) {
  const [history, setHistory] = useState<AskRun[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);

  const load = useCallback(() => { api<{ history: AskRun[] }>("/api/ask").then((d) => setHistory(d.history), () => setHistory([])); }, []);
  useEffect(() => {
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [history, busy]);

  const ask = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(text); setFailed(null); setQ("");
    try {
      await api<AskRun>("/api/ask", { method: "POST", json: { question: text } });
      window.dispatchEvent(new Event(CHANGED));
    } catch (e) {
      setFailed((e as Error).message); setQ(text);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  useEffect(() => {
    if (autoAsk && asked.current !== autoAsk) { asked.current = autoAsk; void ask(autoAsk); }
  }, [autoAsk, ask]);

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(q); };
  const list = [...(history ?? [])].reverse();

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {history === null ? <ListSkeleton rows={3} className="py-2" />
          : !list.length && !busy ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Ask about your own products, stock, ads, candidates and suppliers. Scout only reads, and says when the data isn&apos;t there.</p>
              <ul className="space-y-1.5">
                {EXAMPLES.map((x) => (
                  <li key={x}><ListButton onClick={() => void ask(x)} className="rounded-[10px] border border-border px-3 py-2">{x}</ListButton></li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="space-y-4 pb-2" aria-label="Questions and answers">
              {list.map((r) => <Answer key={r.id} r={r} />)}
              {busy && (
                <li className="space-y-2">
                  <p className="ml-6 rounded-[10px] bg-primary-soft px-3 py-2 text-sm text-primary-ink">{busy}</p>
                  <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground" role="status"><Loader2Icon className="size-4 animate-spin" /> Looking at your data…</p>
                </li>
              )}
            </ol>
          )}
        <div ref={end} />
      </div>
      {failed && <p role="alert" className="mt-2 text-meta text-danger">{failed}</p>}
      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <label htmlFor={inputId} className="sr-only">Ask Scout a question</label>
        <Textarea id={inputId} value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={500} placeholder="Ask about your data…" className="min-h-0 resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
        <Button type="submit" size="icon" aria-label="Ask" disabled={!q.trim() || !!busy}>{busy ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}</Button>
      </form>
    </div>
  );
}

/** The panel on Today (1280 px and wider). */
export function AskScoutPanel() {
  return (
    <section aria-labelledby="ask-scout-title" className="panel flex h-[calc(100dvh-7.5rem)] max-h-[52rem] flex-col p-4">
      <h2 id="ask-scout-title" className="mb-3 flex items-center gap-2 text-base font-semibold"><MessageCircleQuestionIcon className="size-4 text-primary-ink" /> Ask Scout</h2>
      <AskScout inputId={INLINE_INPUT} className="flex-1" />
    </section>
  );
}

const Ctx = createContext<{ open: (question?: string) => void }>({ open: () => {} });
export const useAskScout = () => useContext(Ctx);

/** Ask Scout anywhere: the sheet, opened by ⌘K's "Ask Scout…" or Today's button; on Today's wide layout, the panel instead. */
export function AskScoutProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [autoAsk, setAutoAsk] = useState<string | null>(null);
  const show = useCallback((question?: string) => {
    const inline = document.getElementById(INLINE_INPUT) as HTMLTextAreaElement | null;
    // The panel is on screen: use it.
    if (inline && inline.offsetParent !== null && !question) { inline.focus(); return; }
    setAutoAsk(question?.trim() || null);
    setOpen(true);
  }, []);
  return (
    <Ctx.Provider value={{ open: show }}>
      {children}
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAutoAsk(null); }}>
        <SheetContent side="right" className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2"><MessageCircleQuestionIcon className="size-4 text-primary-ink" /> Ask Scout</SheetTitle>
            <SheetDescription>Answers from your own data only. Scout can&apos;t change anything.</SheetDescription>
          </SheetHeader>
          {open && <AskScout inputId="ask-scout-sheet" autoAsk={autoAsk} className="flex-1 px-4 pb-4" />}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

/** Today's button below 1280 px: opens the sheet. */
export function AskScoutButton({ className }: { className?: string }) {
  const { open } = useAskScout();
  return <Button variant="secondary" className={className} onClick={() => open()}><MessageCircleQuestionIcon /> Ask Scout</Button>;
}
