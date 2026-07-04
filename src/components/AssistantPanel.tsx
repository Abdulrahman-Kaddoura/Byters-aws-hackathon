import { Sparkles } from 'lucide-react';
import type { PatientCase } from '../types';
import { ChatThread } from './Chat';
import { GLOBAL_PROMPTS } from '../data/aiResponder';

export function AssistantPanel({ caseData, sticky = true }: { caseData: PatientCase; sticky?: boolean }) {
  return (
    <div className={sticky ? 'lg:sticky lg:top-20' : ''}>
      <div className="card flex flex-col overflow-hidden" style={{ maxHeight: sticky ? 'calc(100vh - 6rem)' : undefined }}>
        <div className="flex items-center gap-2.5 border-b bg-gradient-to-r from-brand-50/70 to-teal-50/60 px-4 py-3 dark:from-brand-500/10 dark:to-teal-500/8">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-500 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Aura Assistant</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
              Online · aware of this case
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <ChatThread
            caseData={caseData}
            seed={caseData.assistantThread}
            suggestions={GLOBAL_PROMPTS}
            placeholder="Ask about this case…"
            compact
          />
        </div>
      </div>
    </div>
  );
}
