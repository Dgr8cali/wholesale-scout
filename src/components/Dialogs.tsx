"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Style the confirm button as destructive (deletes, removals). */
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  description?: string;
}

interface Dialogs {
  /** Resolves true when confirmed. */
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** Resolves the trimmed text, or null when cancelled or empty. */
  prompt: (o: PromptOptions) => Promise<string | null>;
}

const Ctx = createContext<Dialogs | null>(null);

/** In-app confirm and prompt dialogs, used in place of the browser's own. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [promptState, setPromptState] = useState<PromptOptions | null>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((v: boolean | string | null) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = (v) => resolve(v === true);
    setConfirmState(o);
  }), []);
  const prompt = useCallback((o: PromptOptions) => new Promise<string | null>((resolve) => {
    resolver.current = (v) => resolve(typeof v === "string" && v.trim() ? v.trim() : null);
    setText(o.defaultValue ?? "");
    setPromptState(o);
  }), []);

  const finish = (v: boolean | string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
    setPromptState(null);
  };

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && finish(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {confirmState?.description && <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={confirmState?.destructive ? "destructive" : "default"} onClick={() => finish(true)}>
              {confirmState?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!promptState} onOpenChange={(open) => !open && finish(null)}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); finish(text); }}>
            <DialogHeader>
              <DialogTitle>{promptState?.title}</DialogTitle>
              {promptState?.description && <DialogDescription>{promptState.description}</DialogDescription>}
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="prompt-input">{promptState?.label}</Label>
              <Input id="prompt-input" autoFocus value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish(null)}>Cancel</Button>
              <Button type="submit" disabled={!text.trim()}>{promptState?.confirmLabel ?? "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useDialogs(): Dialogs {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDialogs needs <DialogsProvider>");
  return d;
}
