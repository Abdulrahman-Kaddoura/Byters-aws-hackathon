import { useState } from 'react';
import { useLocation } from 'wouter';
import { X, Sparkles } from 'lucide-react';
import { useCase } from '@/hooks/useCases';
import { ChatThread } from '@/components/Chat';
import { GLOBAL_PROMPTS } from '@/data/prompts';
import { currentIdentity } from '@/lib/auth';
import { cn } from '@/lib/utils';

const CLINICIAN_GROUPS = ['physician', 'admin', 'compliance'];

/** Floating case-level assistant chat — only meaningful once a case is open
 * (the backend's assistant endpoint is scoped to one case). */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const match = /^\/cases\/([^/]+)/.exec(location);
  const caseId = match && match[1] !== 'new' ? match[1] : undefined;
  const { data: caseData } = useCase(caseId);
  const isClinician = currentIdentity()?.groups.some((g) => CLINICIAN_GROUPS.includes(g)) ?? false;

  if (!caseId || !caseData || !isClinician) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-4 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between bg-primary p-4 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <div className="leading-tight">
                <p className="text-sm font-semibold">Aura Assistant</p>
                <p className="text-[11px] opacity-80">{caseData.patient.name} · {caseData.id}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <ChatThread
              caseId={caseData.id}
              seed={
                caseData.assistantThread.length
                  ? caseData.assistantThread
                  : [{ role: 'ai', text: `Hi, I'm ready to help with ${caseData.patient.name}'s case. Ask me anything about it.`, time: 'now' }]
              }
              suggestions={GLOBAL_PROMPTS}
              placeholder="Ask about this case…"
              compact
            />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95',
          open ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'
        )}
        aria-label="Toggle Aura assistant"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </div>
  );
}
