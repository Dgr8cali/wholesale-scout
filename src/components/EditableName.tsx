"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";

/**
 * A name that edits in place: click the pencil (or the name), type, Enter or click away to
 * save, Esc to cancel. `onSave` rejects to keep editing with an error.
 */
export function EditableName({ value, onSave, display, className = "", inputClassName = "" }: {
  value: string;
  onSave: (name: string) => Promise<void>;
  /** What to show when not editing, e.g. a link; defaults to the value. */
  display?: ReactNode;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const name = draft.trim();
    if (!name || name === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    try {
      await onSave(name);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className={`group inline-flex min-w-0 items-baseline gap-1.5 ${className}`}>
        <span className="min-w-0 break-words">{display ?? value}</span>
        <Button variant="ghost" size="icon-xs" aria-label="Rename" title="Rename"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDraft(value); setEditing(true); }}
          className="self-center text-muted-foreground hover:text-link">
          <PencilIcon />
        </Button>
      </span>
    );
  }
  return (
    <span className="inline-flex w-full min-w-0 flex-col gap-1">
      <input autoFocus className={`input ${inputClassName}`} value={draft} maxLength={120} disabled={saving} aria-label="Run name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(value);
            setError(null);
          }
        }} />
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
