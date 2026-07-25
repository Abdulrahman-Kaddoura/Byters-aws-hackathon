import { Link } from 'react-router-dom';
import { Sparkles, FolderOpen } from 'lucide-react';
import { useCurrentCase } from '../lib/currentCase';
import { AssistantPanel } from './AssistantPanel';

/**
 * Persistent right-hand column for Aura, visible on every page (lg+) —
 * mirrors the left nav Sidebar rather than floating over content. On case
 * pages it renders the same case-scoped, backend-wired conversation
 * (AssistantPanel -> ChatThread -> POST /cases/{caseId}/assistant) that used
 * to be docked inside CaseLayout; everywhere else there's no case in scope,
 * so it shows an honest empty state rather than fabricating a reply the
 * backend has no route for.
 */
export function AssistantDock() {
  const currentCase = useCurrentCase();

  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-[340px] flex-col border-l bg-[var(--surface)] lg:flex">
      {currentCase ? (
        <AssistantPanel key={currentCase.id} caseData={currentCase} />
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2.5 border-b bg-gradient-to-r from-brand-50/70 to-teal-50/60 px-4 py-3 dark:from-brand-500/10 dark:to-teal-500/8">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Aura Assistant</p>
              <p className="text-[11px] text-muted">No case open</p>
            </div>
          </div>
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
            <Link to="/cases" className="btn btn-primary mt-1 px-3 py-1.5 text-sm">
              Go to cases
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}
