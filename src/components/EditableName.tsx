"use client";

import { useState, type ReactNode } from "react";

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
        <button type="button" aria-label="Rename" title="Rename"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDraft(value); setEditing(true); }}
          className="text-muted opacity-60 hover:text-accent hover:opacity-100 group-hover:opacity-100">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </button>
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
      {error && <span className="text-xs text-fail">{error}</span>}
    </span>
  );
}
