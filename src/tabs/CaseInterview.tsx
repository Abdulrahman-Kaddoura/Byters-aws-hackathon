import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Sparkles, FileText, Send, CheckCircle2, Loader2, Tablet } from 'lucide-react';
import type { PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Transcript } from '@/components/Chat';
import { TagList } from '@/components/common';
import { usePostInterviewMessage, useGenerateSummary } from '@/hooks/useCases';

export function CaseInterview({ caseData: c }: { caseData: PatientCase }) {
  const [, navigate] = useLocation();
  const [view, setView] = useState<'chat' | 'summary'>(c.summary?.chiefComplaint ? 'summary' : 'chat');
  const [input, setInput] = useState('');
  const [complete, setComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const postMessage = usePostInterviewMessage(c.id);
  const generateSummary = useGenerateSummary(c.id);

  const hasInterview = c.interview.length > 0;
  const interviewOpen = c.status === 'AI Interview';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [c.interview.length, postMessage.isPending]);

  async function send() {
    const text = input.trim();
    if (!text || postMessage.isPending) return;
    setInput('');
    const res = await postMessage.mutateAsync(text);
    if (res.complete) setComplete(true);
  }

  if (!hasInterview) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Sparkles className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold">No Interview Data Yet</h3>
        <p className="max-w-md text-muted-foreground">This case has no AI interview transcript yet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Clinical Interview</h2>
        <div className="flex items-center gap-3">
          {interviewOpen && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${c.id}/patient-mode`)}>
              <Tablet className="mr-2 h-4 w-4" /> Hand device to patient
            </Button>
          )}
          <div className="inline-flex rounded-md bg-muted p-1">
            <button
              onClick={() => setView('chat')}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${view === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Transcript
            </button>
            <button
              onClick={() => setView('summary')}
              disabled={!c.summary?.chiefComplaint}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${view === 'summary' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              AI Summary
            </button>
          </div>
        </div>
      </div>

      {view === 'chat' && (
        <Card className="flex flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1 bg-muted/20 p-6">
            <div ref={scrollRef} className="mx-auto max-w-3xl space-y-6">
              <div className="mb-8 text-center text-xs text-muted-foreground">Interview started {c.createdAt && new Date(c.createdAt).toLocaleDateString()}</div>
              <Transcript messages={c.interview} />
              {postMessage.isPending && <p className="text-center text-xs text-muted-foreground">Aura is thinking…</p>}
            </div>
          </ScrollArea>

          {interviewOpen && (
            <div className="border-t bg-card p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="mx-auto flex max-w-3xl items-center gap-2"
              >
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type the patient's answer…" disabled={postMessage.isPending} />
                <Button type="submit" size="icon" disabled={!input.trim() || postMessage.isPending} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          )}

          <div className="border-t bg-card p-4 text-center">
            {generateSummary.isPending ? (
              <Button disabled className="w-full max-w-sm">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Structuring clinical notes…
              </Button>
            ) : (
              <Button onClick={() => generateSummary.mutate()} variant={complete ? 'default' : 'secondary'} className="w-full max-w-sm">
                <FileText className="mr-2 h-4 w-4" /> Generate Structured Summary
              </Button>
            )}
            {generateSummary.isError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{(generateSummary.error as Error).message}</p>}
          </div>
        </Card>
      )}

      {view === 'summary' && c.summary && (
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-3">
          <Card className="overflow-auto lg:col-span-2">
            <CardContent className="space-y-5 p-8">
              <h3 className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" /> Structured Clinical Summary
              </h3>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chief Complaint</p>
                <p className="mt-1 text-sm">{c.summary.chiefComplaint}</p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">History of Present Illness (HPI)</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.summary.hpi}</p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Relevant Medical History</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {c.summary.relevantHistory.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>

              {c.summary.redFlags.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">Red Flags</p>
                  <div className="mt-2">
                    <TagList items={c.summary.redFlags} tone="red" />
                  </div>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Symptom Timeline</p>
                <ol className="mt-2 space-y-2">
                  {c.summary.timeline.map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-28 shrink-0 font-semibold text-primary">{t.time}</span>
                      <span className="text-muted-foreground">{t.event}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {interviewOpen ? (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-6">
                  <h4 className="mb-2 font-semibold text-primary">Doctor Action Required</h4>
                  <p className="mb-4 text-sm text-muted-foreground">Review the AI-generated summary above for accuracy, then move the case forward.</p>
                  <Button className="w-full" onClick={() => setView('chat')}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Back to transcript
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">Summary approved — case has moved to doctor review.</CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
