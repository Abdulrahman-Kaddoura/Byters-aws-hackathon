import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X, FolderOpen } from 'lucide-react';
import { useCurrentCase } from '../lib/currentCase';

/**
 * App-wide launcher for Aura, reachable from every screen that isn't already
 * a case page. Case pages already show a docked, case-scoped AssistantPanel
 * (see CaseLayout.tsx) backed by the same `POST /cases/{caseId}/assistant`
 * endpoint — showing this floating launcher there too would just be a second,
 * un-synced conversation surface for the same case. Everywhere else (the
 * dashboard, case lists, intake, settings…) there was previously no way to
 * reach Aura at all, which this fixes with an honest prompt to open a case
 * rather than fabricating a caseless conversation the backend can't support.
 */
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const currentCase = useCurrentCase();

  if (currentCase) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Aura assistant"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gradient-to-br from-brand-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-lift transition-transform hover:scale-105"
      >
        <Sparkles className="h-4 w-4" />
        Ask Aura
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Aura assistant"
      className="fixed bottom-5 right-5 z-50 flex h-[360px] w-[min(92vw,340px)] flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-lift animate-fade-in"
    >
      <header className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-brand-50/70 to-teal-50/60 px-4 py-3 dark:from-brand-500/10 dark:to-teal-500/8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-500 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Aura Assistant</p>
            <p className="text-[11px] text-muted">No case open</p>
          </div>
        </div>
        <button
          aria-label="Close Aura assistant"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-muted hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted">
          <FolderOpen className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">No case open</p>
          <p className="mt-1 max-w-[240px] text-[13px] text-muted">
            Aura's conversation is scoped to a specific case. Open one to start asking.
          </p>
        </div>
        <Link
          to="/cases"
          onClick={() => setOpen(false)}
          className="btn btn-primary mt-1 px-3 py-1.5 text-sm"
        >
          Go to cases
        </Link>
      </div>
    </section>
  );
}
